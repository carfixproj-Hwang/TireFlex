// src/pages/AdminTimelinePage.tsx
import { useEffect, useMemo, useState } from "react";
import {
  adminListBlockedTimesByDate,
  adminListReservationsByDate,
  adminSetReservationStatus,
  type AdminBlockedTime,
  type AdminReservationItem,
} from "../lib/adminSchedule";

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addMinutes(date: Date, mins: number) {
  return new Date(date.getTime() + mins * 60_000);
}

function fmtTimeKst(date: Date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function isoAtKst(dateStr: string, hhmm: string) {
  return `${dateStr}T${hhmm}:00+09:00`;
}

function overlaps(slotIso: string, durationMinutes: number, startIso: string, endIso: string) {
  const a1 = new Date(slotIso).getTime();
  const a2 = a1 + durationMinutes * 60_000;
  const b1 = new Date(startIso).getTime();
  const b2 = new Date(endIso).getTime();
  return a1 < b2 && b1 < a2;
}

function buildSlots(dateStr: string) {
  const start = new Date(isoAtKst(dateStr, "09:00"));
  const end = new Date(isoAtKst(dateStr, "18:00"));
  const slots: { label: string; iso: string }[] = [];
  for (let t = start; t < end; t = addMinutes(t, 30)) {
    slots.push({ label: fmtTimeKst(t), iso: t.toISOString() });
  }
  return slots;
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(17,24,39,0.75)",
  color: "#fff",
  outline: "none",
};

export default function AdminTimelinePage() {
  const [dateStr, setDateStr] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [reservations, setReservations] = useState<AdminReservationItem[]>([]);
  const [blocks, setBlocks] = useState<AdminBlockedTime[]>([]);

  const slots = useMemo(() => buildSlots(dateStr), [dateStr]);

  async function refresh() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [r, b] = await Promise.all([adminListReservationsByDate(dateStr), adminListBlockedTimesByDate(dateStr)]);
      setReservations(r);
      setBlocks(b);
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr]);

  const rowForSlot = useMemo(() => {
    return slots.map((s) => {
      const block = blocks.find((bt) => overlaps(s.iso, 30, bt.start_at, bt.end_at));
      const res = reservations.find((r) => {
        const end = addMinutes(new Date(r.scheduled_at), r.duration_minutes).toISOString();
        return overlaps(s.iso, 30, r.scheduled_at, end);
      });
      return { slot: s, block, res };
    });
  }, [slots, blocks, reservations]);

  const statusOptions = ["pending", "confirmed", "completed", "canceled", "no_show"];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h2 style={{ margin: "8px 0 12px" }}>관리자 타임라인</h2>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          날짜
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
            }}
          />
        </label>

        <button
          onClick={refresh}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "#111827",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          새로고침
        </button>

        {loading ? <span>로딩중...</span> : null}
        {errorMsg ? <span style={{ color: "crimson" }}>{errorMsg}</span> : null}
      </div>

      <div style={{ marginTop: 14, border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr 240px",
            background: "#f9fafb",
            padding: 12,
            fontWeight: 800,
          }}
        >
          <div>시간</div>
          <div>상태</div>
          <div>예약 상태 변경</div>
        </div>

        {rowForSlot.map(({ slot, block, res }) => {
          const isBlocked = Boolean(block);
          const isReserved = Boolean(res);

          const badgeText = isBlocked
            ? `차단: ${block?.reason ?? "사유 없음"}`
            : isReserved
              ? `${res?.service_name} (${res?.duration_minutes}분) - ${res?.full_name ?? "이름없음"}`
              : "비어있음";

          const bg = isBlocked ? "#fff7ed" : isReserved ? "#eff6ff" : "#ffffff";

          return (
            <div
              key={slot.iso}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 240px",
                padding: 12,
                background: bg,
                borderTop: "1px solid #e5e7eb",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 800 }}>
                {slot.label}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontWeight: 800 }}>{badgeText}</div>
                {isReserved ? (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    차량: {res?.car_model ?? "-"} | 연락처: {res?.phone ?? "-"} | 현재상태: {res?.status}
                  </div>
                ) : null}
              </div>

              <div>
                {isReserved ? (
                  <select
                    value={res!.status}
                    onChange={async (e) => {
                      const next = e.target.value;
                      try {
                        await adminSetReservationStatus(res!.reservation_id, next);
                        await refresh();
                      } catch (err: any) {
                        alert(err?.message ?? String(err));
                      }
                    }}
                    style={selectStyle}
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s} style={{ color: "#111827", background: "#ffffff" }}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontSize: 12, opacity: 0.6 }}>{isBlocked ? "차단됨" : "예약 없음"}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>운영시간: 09:00-18:00 (KST), 30분 슬롯 기준</div>
    </div>
  );
}
