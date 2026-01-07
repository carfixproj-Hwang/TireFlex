// src/pages/AdminBlockedTimesPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { adminListBlockedTimesByDate, adminCreateBlockedTime, adminDeleteBlockedTime, type AdminBlockedTime } from "../lib/adminSchedule";
import { adminListReservationsByDate, type AdminReservationRow } from "../lib/adminReservations";
import { adminCreateBlockedTimeWithShift, adminRestoreReservationsForBlock } from "../lib/adminBlockedShift";

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isoAtKst(dateStr: string, hhmm: string) {
  return `${dateStr}T${hhmm}:00+09:00`;
}

function addMinutesIso(iso: string, mins: number) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const a0 = new Date(aStart).getTime();
  const a1 = new Date(aEnd).getTime();
  const b0 = new Date(bStart).getTime();
  const b1 = new Date(bEnd).getTime();
  return a0 < b1 && b0 < a1;
}

export default function AdminBlockedTimesPage() {
  const location = useLocation();

  const [dateStr, setDateStr] = useState(() => {
    const sp = new URLSearchParams(location.search);
    const q = sp.get("date");
    if (q && isYmd(q)) return q;
    return toDateInputValue(new Date());
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [blocked, setBlocked] = useState<AdminBlockedTime[]>([]);
  const [reservations, setReservations] = useState<AdminReservationRow[]>([]);

  const [startHHMM, setStartHHMM] = useState("09:00");
  const [endHHMM, setEndHHMM] = useState("18:00");
  const [reason, setReason] = useState("");

  // ✅ URL의 date 파라미터가 바뀌면 반영
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const q = sp.get("date");
    if (q && isYmd(q) && q !== dateStr) setDateStr(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  async function refresh() {
    setLoading(true);
    setMsg(null);
    try {
      const [b, r] = await Promise.all([
        adminListBlockedTimesByDate(dateStr),
        adminListReservationsByDate(dateStr),
      ]);
      setBlocked(b);
      setReservations(r);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr]);

  const blockingWindow = useMemo(() => {
    const startIso = isoAtKst(dateStr, startHHMM);
    const endIso = isoAtKst(dateStr, endHHMM);
    return { startIso, endIso };
  }, [dateStr, startHHMM, endHHMM]);

  const overlappedReservations = useMemo(() => {
    const { startIso, endIso } = blockingWindow;
    return reservations.filter((r) => {
      const rEnd = addMinutesIso(r.scheduled_at, r.duration_minutes);
      return overlaps(r.scheduled_at, rEnd, startIso, endIso);
    });
  }, [reservations, blockingWindow]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 8 }}>
      <h2 style={{ marginTop: 0 }}>차단 시간 관리</h2>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          날짜
          <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </label>

        <button onClick={refresh} disabled={loading} style={{ padding: "10px 12px", cursor: "pointer" }}>
          새로고침
        </button>

        {loading ? <span>로딩중...</span> : null}
        {msg ? <span style={{ color: "crimson" }}>{msg}</span> : null}
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>차단 추가</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            시작
            <input type="time" value={startHHMM} step={1800} onChange={(e) => setStartHHMM(e.target.value)} />
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            종료
            <input type="time" value={endHHMM} step={1800} onChange={(e) => setEndHHMM(e.target.value)} />
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 260px" }}>
            사유
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 휴무 / 장비점검" style={{ width: "100%" }} />
          </label>

          <button
            disabled={loading}
            style={{ padding: "10px 14px", cursor: "pointer", fontWeight: 900 }}
            onClick={async () => {
              if (startHHMM >= endHHMM) return alert("종료 시간이 시작 시간보다 이후여야 합니다.");

              const { startIso, endIso } = blockingWindow;
              const hit = overlappedReservations;

              if (hit.length > 0) {
                const first = hit[0];
                const name = first.full_name ?? "고객";
                const ok = confirm(`해당 시간에는 ${name}님의 예약 포함 ${hit.length}건 예약이 있습니다.\n작업일을 뒤로 미루겠습니까?`);
                if (!ok) return;

                try {
                  setLoading(true);
                  const res = await adminCreateBlockedTimeWithShift({
                    start_at: startIso,
                    end_at: endIso,
                    reason: reason.trim() ? reason.trim() : null,
                  });
                  alert(`차단 생성 완료. 예약 ${res.shifted}건을 뒤로 미뤘습니다.`);
                  await refresh();
                } catch (e: any) {
                  alert(e?.message ?? String(e));
                } finally {
                  setLoading(false);
                }
                return;
              }

              try {
                setLoading(true);
                await adminCreateBlockedTime(startIso, endIso, reason.trim() ? reason.trim() : null);
                await refresh();
              } catch (e: any) {
                alert(e?.message ?? String(e));
              } finally {
                setLoading(false);
              }
            }}
          >
            차단 추가
          </button>
        </div>

        {overlappedReservations.length > 0 ? (
          <div style={{ marginTop: 10, fontSize: 12, color: "#b45309" }}>
            ⚠️ 현재 입력한 차단 시간과 겹치는 예약이 {overlappedReservations.length}건 있습니다.
          </div>
        ) : null}
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ background: "#f9fafb", padding: 10, fontWeight: 900 }}>차단 목록</div>

        {blocked.length === 0 ? (
          <div style={{ padding: 12, opacity: 0.7 }}>차단이 없습니다.</div>
        ) : (
          blocked.map((bt) => (
            <div
              key={bt.id}
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "space-between",
                alignItems: "center",
                padding: 12,
                borderTop: "1px solid #e5e7eb",
              }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontWeight: 900 }}>
                  ⛔ {new Date(bt.start_at).toLocaleString("ko-KR")} ~ {new Date(bt.end_at).toLocaleString("ko-KR")}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{bt.reason ?? "-"}</div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={loading}
                  style={{ padding: "9px 12px", cursor: "pointer", borderRadius: 10, border: "1px solid #e5e7eb" }}
                  onClick={async () => {
                    const ok = confirm("이 차단을 삭제할까요?");
                    if (!ok) return;

                    try {
                      setLoading(true);
                      await adminDeleteBlockedTime(bt.id);
                      await refresh();

                      const okRestore = confirm("이 차단 때문에 뒤로 미뤄진 예약이 있다면, 가능한 원래 일정으로 복구할까요?");
                      if (!okRestore) return;

                      const res = await adminRestoreReservationsForBlock(bt.id);
                      alert(`복구 결과: ${res.restored}건 복구, ${res.skipped}건 스킵(겹침/수동변경 등)`);
                      await refresh();
                    } catch (e: any) {
                      alert(e?.message ?? String(e));
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
