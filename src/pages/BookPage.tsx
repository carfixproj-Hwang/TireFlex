// src/pages/BookPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createReservation,
  getAvailableSlots,
  getBusinessSettings,
  listActiveServiceItems,
  type BusinessSettings,
  type ServiceItem,
} from "../lib/booking";
import { supabase } from "../lib/supabaseClient";
import "../styles/bookPremium.css";

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

/**
 * ✅ 영업일 예약 판정
 * - 정석: duration_unit === "workdays" && duration_value >= 1
 * - 레거시 보정: duration_unit이 없거나 minutes인데 duration_minutes가 1440의 배수(>=1440)면 workdays로 간주
 */
function isWorkdaysItem(it: ServiceItem | null): boolean {
  if (!it) return false;

  const unit = it.duration_unit ?? null;
  const v = it.duration_value ?? 0;
  if (unit === "workdays" && v >= 1) return true;

  const mins = Number(it.duration_minutes ?? 0);
  if ((!unit || unit === "minutes") && mins >= 1440 && mins % 1440 === 0) return true;

  return false;
}

function workdaysValue(it: ServiceItem | null): number {
  if (!it) return 0;
  if (it.duration_unit === "workdays" && (it.duration_value ?? 0) >= 1) return Number(it.duration_value);
  const mins = Number(it.duration_minutes ?? 0);
  if (mins >= 1440 && mins % 1440 === 0) return mins / 1440;
  return 0;
}

function formatDuration(it: ServiceItem | null): string {
  if (!it) return "-";
  if (isWorkdaysItem(it)) {
    const d = workdaysValue(it);
    return d >= 1 ? `${d}일` : "-";
  }
  return `${it.duration_minutes}분`;
}

export default function BookPage() {
  const nav = useNavigate();
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

      // ✅ workdays(레거시 포함)이면 슬롯 없이 “09:00 시작” 고정 선택
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

      // ✅ 예약 생성 후 → 내 정비 내역으로 이동
      nav("/my/history", { replace: true });
    } catch (e: any) {
      setMsg(`예약 실패: ${e.message ?? String(e)}`);
    }
  };

  const maxBatch = Math.max(1, settings?.max_batch_qty ?? 1);
  const capacity = Math.max(1, settings?.capacity ?? 1);

  const slotMeta = useMemo(() => {
    if (loading) return "로딩중…";
    if (isWorkdays) return "일(영업일) 단위 예약";
    return `가능 슬롯: ${slots.length}개`;
  }, [loading, isWorkdays, slots.length]);

  return (
    <div className="bookWrap">
      <div className="bookHeader">
        <div>
          <div className="bookKicker">BOOKING</div>
          <h2 className="bookTitle">예약하기</h2>
          <p className="bookSub">원하는 정비를 선택하고, 가능한 시간에 빠르게 예약하세요.</p>
        </div>

        <div className="bookMetaPills">
          <span className="bookPill">{slotMeta}</span>
          <span className="bookPill">동시 수용: {capacity}</span>
          <span className="bookPill">1회 최대: {maxBatch}</span>
        </div>
      </div>

      <div className="bookGrid">
        {/* LEFT: 선택/슬롯 */}
        <section className="bookCard">
          <div className="bookCardHead">
            <div className="bookCardTitle">예약 설정</div>
            {selectedItem ? <div className="bookCardHint">소요: {formatDuration(selectedItem)}</div> : null}
          </div>

          <div className="bookFormRow">
            <label className="bookField">
              <div className="bookLabel">정비 아이템</div>
              <select className="bookSelect" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name} ({formatDuration(it)})
                  </option>
                ))}
              </select>
            </label>

            <label className="bookField">
              <div className="bookLabel">예약일</div>
              <input className="bookInput" type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </label>

            <label className="bookField">
              <div className="bookLabel">수량</div>
              <select
                className="bookSelect"
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
          </div>

          <div className="bookDivider" />

          <div className="bookCardHead" style={{ marginTop: 6 }}>
            <div className="bookCardTitle">가능 시간</div>
            <div className="bookCardHint">{isWorkdays ? "09:00 시작 고정" : "시간을 선택하세요"}</div>
          </div>

          {isWorkdays ? (
            <div className="bookInfoBox">
              <div className="bookInfoTitle">이 아이템은 “영업일 단위” 예약입니다.</div>
              <div className="bookInfoLine">
                시작 시간: <b>선택한 날짜 09:00(KST)</b>
              </div>
              <div className="bookInfoLine">
                기간: <b>{formatDuration(selectedItem)}</b> (하루 09:00~18:00 기준)
              </div>
              <div className="bookInfoFoot">
                * 중간에 차단/휴무가 있으면 해당 일은 건너뛰고 이후 작업일만 뒤로 배치됩니다.
              </div>
            </div>
          ) : (
            <div className="bookSlots">
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`bookSlotBtn ${selected === s ? "isSelected" : ""}`}
                  onClick={() => setSelected(s)}
                >
                  {fmtTime(s)}
                </button>
              ))}
              {!loading && slots.length === 0 ? <div className="bookEmpty">가능한 시간이 없습니다.</div> : null}
            </div>
          )}
        </section>

        {/* RIGHT: 예약 정보/입력 */}
        <section className="bookCard">
          <div className="bookCardHead">
            <div className="bookCardTitle">예약 정보</div>
            <div className="bookCardHint">필수 입력을 완료하세요</div>
          </div>

          <div className="bookSummary">
            <div className="bookSummaryLabel">선택</div>
            <div className="bookSummaryValue">{selectedLabel || "-"}</div>
            {!isWorkdays ? <div className="bookSummarySub">수량: {qty}개</div> : null}
          </div>

          <label className="bookField" style={{ marginTop: 10 }}>
            <div className="bookLabel">증상/요청사항</div>
            <textarea className="bookTextarea" rows={5} value={problem} onChange={(e) => setProblem(e.target.value)} />
          </label>

          <div className="bookToggleRow">
            <label className="bookToggle">
              <input type="checkbox" checked={insurance} onChange={(e) => setInsurance(e.target.checked)} />
              <span>보험처리</span>
            </label>
          </div>

          <label className="bookField">
            <div className="bookLabel">추가 메모 (선택)</div>
            <input className="bookInput" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 방문 전 연락 부탁" />
          </label>

          <button className="bookPrimaryBtn" type="button" onClick={handleReserve} disabled={loading}>
            <span className="bookBtnSheen" aria-hidden />
            {loading ? "처리중…" : "예약 생성"}
          </button>

          {msg ? <div className={`bookToast ${msg.includes("실패") ? "isBad" : ""}`}>{msg}</div> : null}
        </section>
      </div>
    </div>
  );
}
