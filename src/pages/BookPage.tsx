// src/pages/BookPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createReservation,
  getAvailableSlots,
  getBusinessSettings,
  listActiveServiceItems,
  type BusinessSettings,
  type ServiceItem,
} from "../lib/booking";
import { supabase } from "../lib/supabaseClient";

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function isoAtKst(dateStr: string, hhmm: string) {
  return `${dateStr}T${hhmm}:00+09:00`;
}

function isWorkdaysItem(it: ServiceItem | null): boolean {
  return Boolean(it && it.duration_unit === "workdays" && (it.duration_value ?? 0) >= 1);
}

function formatDuration(it: ServiceItem | null): string {
  if (!it) return "-";
  if (it.duration_unit === "workdays" && it.duration_value) return `${it.duration_value}일`;
  return `${it.duration_minutes}분`;
}

export default function BookPage() {
  const [searchParams] = useSearchParams();
  const requestedItemId = searchParams.get("service_item_id") ?? "";

  const [dateStr, setDateStr] = useState<string>(todayKST());
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [itemId, setItemId] = useState<string>("");

  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  const [qty, setQty] = useState<number>(1);

  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");

  const [problem, setProblem] = useState<string>("");
  const [insurance, setInsurance] = useState<boolean>(false);
  const [note, setNote] = useState<string>("");

  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const selectedItem = useMemo(() => items.find((x) => x.id === itemId) ?? null, [items, itemId]);
  const isWorkdays = useMemo(() => isWorkdaysItem(selectedItem), [selectedItem]);

  const selectedLabel = useMemo(() => {
    if (!selectedItem) return "";
    if (isWorkdays) return selected ? `${dateStr} (09:00 시작, ${formatDuration(selectedItem)})` : "";
    return selected ? `${dateStr} ${fmtTime(selected)}` : "";
  }, [selected, dateStr, isWorkdays, selectedItem]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setMsg("");

      try {
        const [bs, list] = await Promise.all([getBusinessSettings(), listActiveServiceItems()]);
        if (!mounted) return;

        setSettings(bs);
        setItems(list);

        // ✅ 쿼리로 넘어온 service_item_id 우선 적용
        const found = requestedItemId ? list.find((x) => x.id === requestedItemId) : null;
        const initialId = found?.id ?? list[0]?.id ?? "";
        setItemId(initialId);

        // max_batch_qty 반영해서 qty 초기화
        const maxQ = Math.max(1, bs.max_batch_qty ?? 1);
        setQty((q) => Math.min(Math.max(1, q), maxQ));

        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (uid) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("default_problem, insurance")
            .eq("id", uid)
            .maybeSingle<any>();

          if (profile) {
            setProblem(profile.default_problem ?? "");
            setInsurance(Boolean(profile.insurance));
          }
        }
      } catch (e: any) {
        if (!mounted) return;
        setMsg(`초기 로딩 실패: ${e.message ?? String(e)}`);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // requestedItemId가 바뀌는 경우는 거의 없지만, URL로 직접 접근했을 때를 위해 포함
  }, [requestedItemId]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setMsg("");

      if (!itemId || !selectedItem) {
        setSlots([]);
        setSelected("");
        return;
      }

      if (isWorkdaysItem(selectedItem)) {
        const startIso = isoAtKst(dateStr, "09:00");
        setSlots([]);
        setSelected(startIso);
        return;
      }

      setLoading(true);
      try {
        const list = await getAvailableSlots(dateStr, itemId, qty);
        if (!mounted) return;
        setSlots(list);
        setSelected(list[0] ?? "");
      } catch (e: any) {
        if (!mounted) return;
        setMsg(`슬롯 조회 실패: ${e.message ?? String(e)}`);
        setSlots([]);
        setSelected("");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [dateStr, itemId, selectedItem, qty]);

  const handleReserve = async () => {
    setMsg("");
    if (!itemId) return setMsg("정비 아이템을 선택해주세요.");
    if (!selectedItem) return setMsg("정비 아이템 정보를 불러오지 못했습니다.");
    if (!problem.trim()) return setMsg("증상/요청사항을 입력해주세요.");
    if (!selected) return setMsg(isWorkdays ? "예약일을 선택해주세요." : "선택 가능한 시간이 없습니다.");

    const maxQ = Math.max(1, settings?.max_batch_qty ?? 1);
    const safeQty = Math.min(Math.max(1, qty), maxQ);

    try {
      const id = await createReservation({
        slot_start: selected,
        service_item_id: itemId,
        problem: problem.trim(),
        insurance,
        user_note: note.trim() ? note.trim() : null,
        quantity: safeQty,
      });

      setMsg(`예약 생성 완료 ✅ (id: ${id})`);

      if (!isWorkdays) {
        const list = await getAvailableSlots(dateStr, itemId, safeQty);
        setSlots(list);
        setSelected(list[0] ?? "");
      }
    } catch (e: any) {
      setMsg(`예약 실패: ${e.message ?? String(e)}`);
    }
  };

  const maxBatch = Math.max(1, settings?.max_batch_qty ?? 1);
  const capacity = Math.max(1, settings?.capacity ?? 1);

  return (
    <div style={{ maxWidth: 860 }}>
      <h2 style={{ marginTop: 0 }}>예약하기</h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div>정비 아이템</div>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name} ({formatDuration(it)})
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div>예약일</div>
          <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div>수량</div>
          <select
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            disabled={loading || isWorkdays}
            title={isWorkdays ? "영업일 단위 예약은 수량 개념을 사용하지 않습니다." : ""}
          >
            {Array.from({ length: maxBatch }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}개
              </option>
            ))}
          </select>
        </label>

        <div>
          {loading ? "로딩중..." : isWorkdays ? "일(영업일) 단위 예약" : `가능 슬롯: ${slots.length}개`}
          {selectedItem ? <span style={{ marginLeft: 10, opacity: 0.8 }}>소요시간: {formatDuration(selectedItem)}</span> : null}
          <span style={{ marginLeft: 10, fontSize: 12, opacity: 0.7 }}>
            (동시 작업 수용: {capacity} / 1회 최대 수량: {maxBatch})
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>가능 시간</div>

          {isWorkdays ? (
            <div style={{ lineHeight: 1.6 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>이 아이템은 “영업일 단위” 예약입니다.</div>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
                시작 시간은 <b>선택한 날짜 09:00(KST)</b>로 고정됩니다.
              </div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>
                기간: <b>{formatDuration(selectedItem)}</b> (하루 09:00~18:00 기준)
              </div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
                ※ 중간에 차단/휴무가 있으면 그 날만 건너뛰고 이후 작업일만 뒤로 배치됩니다.
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {slots.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelected(s)}
                  style={{
                    padding: "10px 8px",
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    background: selected === s ? "#111" : "#fff",
                    color: selected === s ? "#fff" : "#111",
                    cursor: "pointer",
                  }}
                >
                  {fmtTime(s)}
                </button>
              ))}
              {slots.length === 0 ? <div style={{ gridColumn: "1 / -1" }}>가능한 시간이 없습니다.</div> : null}
            </div>
          )}
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>예약 정보</div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>선택</div>
            <div style={{ fontWeight: 700 }}>{selectedLabel || "-"}</div>
            {!isWorkdays ? <div style={{ fontSize: 12, opacity: 0.75 }}>수량: {qty}개</div> : null}
          </div>

          <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            <div>증상/요청사항</div>
            <textarea rows={4} value={problem} onChange={(e) => setProblem(e.target.value)} />
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input type="checkbox" checked={insurance} onChange={(e) => setInsurance(e.target.checked)} />
            <div>보험처리</div>
          </label>

          <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            <div>추가 메모(선택)</div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 방문 전 연락 부탁" />
          </label>

          <button onClick={handleReserve} disabled={loading}>
            예약 생성
          </button>

          {msg ? <div style={{ marginTop: 10 }}>{msg}</div> : null}
        </div>
      </div>
    </div>
  );
}
