// src/components/ChatWidget.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { getAvailableSlots, listActiveServiceItems, type ServiceItem } from "../lib/booking";
import "../styles/chatWidget.css";

type MessageRole = "user" | "bot";

type ChatMessage = {
  id: string;
  role: MessageRole;
  text: string;
  ts: number;
};

const QUICK_ACTIONS = [
  "예약 가능 시간",
  "증상 진단",
  "예약 변경/취소",
  "입고 준비물",
  "견적 문의",
];

function kstDateFromNow(offsetDays: number): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + offsetDays);
  return kst.toISOString().slice(0, 10);
}

function parseDateFromText(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes("오늘")) return kstDateFromNow(0);
  if (trimmed.includes("내일")) return kstDateFromNow(1);

  const match = trimmed.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!match) return null;

  const [, y, m, d] = match;
  const mm = String(Math.min(12, Math.max(1, Number(m)))).padStart(2, "0");
  const dd = String(Math.min(31, Math.max(1, Number(d)))).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, "").toLowerCase();
}

function hasSlotIntent(input: string): boolean {
  const normalized = normalizeText(input);
  return normalized.includes("예약") && (normalized.includes("시간") || normalized.includes("가능"));
}

function hasSymptomIntent(input: string): boolean {
  const normalized = normalizeText(input);
  return normalized.includes("증상") || normalized.includes("고장") || normalized.includes("진단") || normalized.includes("이상");
}

function isSymptomDetail(input: string): boolean {
  const normalized = normalizeText(input);
  if (!normalized) return false;
  if (["증상", "증상진단", "고장", "고장진단", "진단", "이상"].includes(normalized)) return false;
  return normalized.length >= 4;
}

async function fetchSymptomDiagnosis(symptom: string): Promise<string> {
  const res = await fetch("/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symptom }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "진단 요청에 실패했습니다.");
  }

  return String(data?.reply || "답변을 생성하지 못했어요.");
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function getBotReply(input: string) {
  const normalized = normalizeText(input);

  if (normalized.includes("예약") && (normalized.includes("시간") || normalized.includes("가능"))) {
    return "예약 가능 시간 확인을 도와드릴게요. 먼저 날짜를 알려주세요. 예) 2026-02-03";
  }

  if (normalized.includes("증상") || normalized.includes("고장") || normalized.includes("진단") || normalized.includes("이상")) {
    return "증상 진단을 원하시면 현재 느끼는 증상을 자세히 알려주세요. 예) 시동이 잘 안 걸리고 계기판 경고등이 켜져요.";
  }

  if (normalized.includes("예약") && (normalized.includes("변경") || normalized.includes("취소"))) {
    return "예약 변경/취소 안내입니다. 고객님 성함과 연락처, 예약 일시를 남겨주시면 확인 후 도와드릴게요.";
  }

  if (normalized.includes("입고") || normalized.includes("준비")) {
    return "입고 전에는 차량 키, 차량 등록증(또는 사진), 정비 요청 내용을 준비해 주세요. 추가로 필요한 서류가 있으면 상담원이 안내드립니다.";
  }

  if (normalized.includes("견적")) {
    return "견적 문의 감사합니다. 차량 모델/연식, 증상, 사진이 있으면 정확도가 높아져요. 데모 단계라 간단한 안내만 제공 중입니다.";
  }

  return "데모 응답입니다. 상담원이 곧 답변드릴 수 있도록 필요한 내용을 남겨주세요.";
}

function createMessage(role: MessageRole, text: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    ts: Date.now(),
  };
}

function pickServiceItem(input: string, items: ServiceItem[]): ServiceItem | null {
  if (!items.length) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const byIndex = Number(trimmed);
  if (Number.isFinite(byIndex) && byIndex >= 1 && byIndex <= items.length) {
    return items[byIndex - 1];
  }

  const normalized = normalizeText(trimmed);
  const match = items.find((item) => normalizeText(item.name).includes(normalized));
  return match ?? null;
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [awaitingDate, setAwaitingDate] = useState(false);
  const [awaitingItem, setAwaitingItem] = useState(false);
  const [awaitingSymptom, setAwaitingSymptom] = useState(false);
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ServiceItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createMessage("bot", "안녕하세요! 차량 예약/상담을 도와드릴게요. 무엇을 도와드릴까요?"),
  ]);

  const bodyRef = useRef<HTMLDivElement | null>(null);

  const lastMessage = useMemo(() => messages[messages.length - 1], [messages]);

  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lastMessage, isOpen, pending]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const items = await listActiveServiceItems();
        if (!mounted) return;
        setServiceItems(items);
      } catch {
        if (!mounted) return;
        setServiceItems([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const buildItemPrompt = () => {
    if (!serviceItems.length) {
      return "예약 기준 항목을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
    }

    const lines = serviceItems.slice(0, 6).map((item, idx) => `${idx + 1}. ${item.name}`);
    const extra = serviceItems.length > 6 ? ` 외 ${serviceItems.length - 6}개` : "";
    return `어떤 정비 항목 기준으로 조회할까요? 번호 또는 항목명을 입력해 주세요.\n${lines.join("\n")}${extra}`;
  };

  const buildSlotReply = async (dateStr: string, basis: ServiceItem) => {
    try {
      const slots = await getAvailableSlots(dateStr, basis.id, 1);
      if (!slots.length) {
        return `${dateStr}에는 가능한 시간이 없습니다. 다른 날짜를 알려주세요.`;
      }

      const formatted = slots.slice(0, 5).map((s) => fmtTime(s));
      const rest = slots.length > 5 ? ` 외 ${slots.length - 5}개` : "";
      return `${dateStr} 기준 가능한 시간입니다 (${basis.name} 기준): ${formatted.join(", ")}${rest}`;
    } catch (err: any) {
      return `가능 시간 조회 중 오류가 발생했어요. (${err?.message ?? "알 수 없는 오류"})`;
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, createMessage("user", trimmed)]);
    setInput("");
    setPending(true);

    const slotIntent = hasSlotIntent(trimmed) || awaitingDate || awaitingItem;
    const symptomIntent = (hasSymptomIntent(trimmed) || awaitingSymptom) && !slotIntent;

    if (symptomIntent) {
      if (!isSymptomDetail(trimmed)) {
        setAwaitingSymptom(true);
        window.setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            createMessage("bot", "현재 겪는 증상을 구체적으로 알려주세요. 예) 시동이 안 걸리고, 엔진에서 쇳소리가 납니다."),
          ]);
          setPending(false);
        }, 250);
        return;
      }

      setAwaitingSymptom(false);

      try {
        const reply = await fetchSymptomDiagnosis(trimmed);
        setMessages((prev) => [...prev, createMessage("bot", reply)]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          createMessage("bot", `진단 요청 중 오류가 발생했어요. (${err?.message ?? "알 수 없는 오류"})`),
        ]);
      } finally {
        setPending(false);
      }
      return;
    }

    if (slotIntent && awaitingItem) {
      const picked = pickServiceItem(trimmed, serviceItems);
      if (!picked) {
        window.setTimeout(() => {
          setMessages((prev) => [...prev, createMessage("bot", buildItemPrompt())]);
          setPending(false);
        }, 250);
        return;
      }

      setSelectedItem(picked);
      setAwaitingItem(false);

      const dateStr = parseDateFromText(trimmed);
      if (!dateStr) {
        window.setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            createMessage("bot", `선택 완료: ${picked.name}. 예약 날짜를 알려주세요. 예) 2026-02-03`),
          ]);
          setPending(false);
        }, 250);
        return;
      }

      const reply = await buildSlotReply(dateStr, picked);
      setMessages((prev) => [...prev, createMessage("bot", reply)]);
      setPending(false);
      return;
    }

    if (slotIntent && !selectedItem) {
      if (serviceItems.length > 1) {
        setAwaitingItem(true);
        window.setTimeout(() => {
          setMessages((prev) => [...prev, createMessage("bot", buildItemPrompt())]);
          setPending(false);
        }, 250);
        return;
      }

      if (serviceItems.length === 1) {
        setSelectedItem(serviceItems[0]);
      }
    }

    const dateStr = slotIntent ? parseDateFromText(trimmed) : null;

    if (slotIntent && !dateStr) {
      setAwaitingDate(true);
      window.setTimeout(() => {
        const basisName = selectedItem?.name ? ` (기준: ${selectedItem.name})` : "";
        setMessages((prev) => [
          ...prev,
          createMessage("bot", `예약 가능 시간을 확인하려면 날짜를 알려주세요.${basisName} 예) 2026-02-03`),
        ]);
        setPending(false);
      }, 250);
      return;
    }

    if (slotIntent && dateStr && selectedItem) {
      setAwaitingDate(false);
      const reply = await buildSlotReply(dateStr, selectedItem);
      setMessages((prev) => [...prev, createMessage("bot", reply)]);
      setPending(false);
      return;
    }

    if (slotIntent && dateStr && !selectedItem) {
      setAwaitingItem(true);
      window.setTimeout(() => {
        setMessages((prev) => [...prev, createMessage("bot", buildItemPrompt())]);
        setPending(false);
      }, 250);
      return;
    }

    window.setTimeout(() => {
      setMessages((prev) => [...prev, createMessage("bot", getBotReply(trimmed))]);
      setPending(false);
    }, 600);
  };

  return (
    <div className="chatWidget">
      {isOpen && (
        <div id="chat-widget-panel" className="chatWidgetPanel" role="dialog" aria-label="상담 챗봇">
          <div className="chatWidgetHeader">
            <div>
              <div className="chatWidgetTitle">차량 상담 챗봇</div>
              <div className="chatWidgetStatus">
                <span className="chatWidgetDot" aria-hidden />
                데모 모드
              </div>
            </div>
            <button className="chatWidgetClose" type="button" onClick={() => setIsOpen(false)}>
              닫기
            </button>
          </div>

          <div className="chatWidgetBody" ref={bodyRef}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chatWidgetMsg ${message.role === "user" ? "chatWidgetMsg--user" : "chatWidgetMsg--bot"}`}
              >
                <div className="chatWidgetBubble">{message.text}</div>
                <div className="chatWidgetMeta">
                  {new Date(message.ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}

            {pending && (
              <div className="chatWidgetMsg chatWidgetMsg--bot">
                <div className="chatWidgetBubble chatWidgetBubble--pending">상담원이 확인 중입니다...</div>
              </div>
            )}
          </div>

          <div className="chatWidgetQuick">
            {QUICK_ACTIONS.map((action) => (
              <button key={action} type="button" className="chatWidgetQuickBtn" onClick={() => sendMessage(action)}>
                {action}
              </button>
            ))}
          </div>

          <form
            className="chatWidgetForm"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage(input);
            }}
          >
            <input
              className="chatWidgetInput"
              placeholder="문의 내용을 입력해 주세요"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button className="chatWidgetSend" type="submit" disabled={!input.trim()}>
              전송
            </button>
          </form>
        </div>
      )}

      <button
        className={`chatWidgetFab ${isOpen ? "is-open" : ""}`}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="chat-widget-panel"
      >
        <span className="chatWidgetFabLabel">상담 챗봇</span>
        <span className="chatWidgetFabHint">예약/정비 안내</span>
      </button>
    </div>
  );
}
