import { useEffect, useMemo, useState } from "react";
import {
  adminListReservationsByDate,
  adminSetReservationStatus,
  type AdminReservationRow,
  type ReservationStatus,
} from "../../lib/adminReservations";

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtKst(iso: string) {
  return new Date(iso).toLocaleString("ko-KR");
}

function fmtTimeKst(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function addMinutes(iso: string, mins: number) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "대기",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소",
  no_show: "노쇼",
};

export default function AdminReservationsPage() {
  const [dateStr, setDateStr] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AdminReservationRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // row별 상태 편집 버퍼
  const [draftStatus, setDraftStatus] = useState<Record<string, ReservationStatus>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setMsg(null);
    try {
      const list = await adminListReservationsByDate(dateStr);
      setItems(list);
      // 현재 상태를 draft로 초기화
      const map: Record<string, ReservationStatus> = {};
      for (const r of list) map[r.reservation_id] = r.status;
      setDraftStatus(map);
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

  const summary = useMemo(() => {
    const total = items.length;
    const by: Record<string, number> = {};
    for (const r of items) by[r.status] = (by[r.status] ?? 0) + 1;
    return { total, by };
  }, [items]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <h2 style={{ margin: "8px 0 12px" }}>관리자 예약 현황/관리</h2>

      <div style={{ display: "grid", gap: 10, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            날짜
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              style={{ padding: "8px 10px" }}
            />
          </label>

          <button onClick={refresh} disabled={loading} style={{ padding: "10px 14px", cursor: "pointer" }}>
            새로고침
          </button>

          {loading ? <span>로딩중...</span> : null}
          {msg ? <span style={{ color: "crimson" }}>{msg}</span> : null}
        </div>

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          총 {summary.total}건 /
          {(["pending", "confirmed", "completed", "canceled", "no_show"] as ReservationStatus[]).map((s) => (
            <span key={s} style={{ marginLeft: 10 }}>
              {STATUS_LABEL[s]} {summary.by[s] ?? 0}
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ background: "#f9fafb", padding: 10, fontWeight: 800 }}>예약 목록</div>

        {items.length === 0 ? (
          <div style={{ padding: 12, opacity: 0.7 }}>예약 없음</div>
        ) : (
          items.map((r) => {
            const endIso = addMinutes(r.scheduled_at, r.duration_minutes);
            const draft = draftStatus[r.reservation_id] ?? r.status;
            const changed = draft !== r.status;

            return (
              <div
                key={r.reservation_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 260px",
                  gap: 10,
                  padding: 12,
                  borderTop: "1px solid #e5e7eb",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 900 }}>
                    {fmtTimeKst(r.scheduled_at)} ~ {fmtTimeKst(endIso)} ({r.duration_minutes}분) · {r.service_name}
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    고객: <b>{r.full_name ?? "-"}</b> / {r.phone ?? "-"} / 차종: {r.car_model ?? "-"}
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    예약시간: {fmtKst(r.scheduled_at)}
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    상태: <b>{STATUS_LABEL[r.status]}</b>
                    {changed ? <span style={{ marginLeft: 8, color: "#b45309" }}>변경됨 → {STATUS_LABEL[draft]}</span> : null}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={draft}
                    onChange={(e) =>
                      setDraftStatus((prev) => ({ ...prev, [r.reservation_id]: e.target.value as ReservationStatus }))
                    }
                    style={{ padding: "10px 10px" }}
                  >
                    {(["pending", "confirmed", "completed", "canceled", "no_show"] as ReservationStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>

                  <button
                    disabled={loading || savingId === r.reservation_id || !changed}
                    onClick={async () => {
                      try {
                        setSavingId(r.reservation_id);
                        const ok = await adminSetReservationStatus(r.reservation_id, draft);
                        if (!ok) throw new Error("상태 변경 실패");
                        await refresh();
                      } catch (e: any) {
                        alert(e?.message ?? String(e));
                      } finally {
                        setSavingId(null);
                      }
                    }}
                    style={{ padding: "10px 12px", cursor: changed ? "pointer" : "not-allowed" }}
                    title={changed ? "상태 적용" : "변경 사항 없음"}
                  >
                    {savingId === r.reservation_id ? "적용중..." : "상태 적용"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
