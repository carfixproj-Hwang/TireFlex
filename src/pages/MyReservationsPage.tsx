// src/pages/MyReservationsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type ServiceItemJoin = {
  name: string;
  duration_minutes: number;
};

type MyReservation = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: "pending" | "confirmed" | "completed" | "canceled" | "no_show" | string;
  service_item_id: string;
  problem?: string | null;
  insurance?: string | null;
  user_note?: string | null;
  // ✅ Supabase join 결과가 배열로 오는 케이스 대응
  service_items?: ServiceItemJoin[] | null;
};

type ViewMode = "upcoming" | "all";

function isFuture(iso: string) {
  return new Date(iso).getTime() > Date.now();
}

function statusLabel(s: string) {
  switch (s) {
    case "pending":
      return "대기";
    case "confirmed":
      return "확정";
    case "completed":
      return "완료";
    case "canceled":
      return "취소";
    case "no_show":
      return "노쇼";
    default:
      return s;
  }
}

function statusStyle(s: string): React.CSSProperties {
  switch (s) {
    case "pending":
      return { background: "#f3f4f6", border: "1px solid #e5e7eb" };
    case "confirmed":
      return { background: "#eef2ff", border: "1px solid #e0e7ff" };
    case "completed":
      return { background: "#ecfdf5", border: "1px solid #d1fae5" };
    case "canceled":
      return { background: "#fff1f2", border: "1px solid #ffe4e6" };
    case "no_show":
      return { background: "#fffbeb", border: "1px solid #fef3c7" };
    default:
      return { background: "#f9fafb", border: "1px solid #e5e7eb" };
  }
}

export default function MyReservationsPage() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MyReservation[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("upcoming");

  async function fetchMyReservations() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      if (!authData.user) {
        setItems([]);
        return;
      }

      const { data, error } = await supabase
        .from("reservations")
        .select(
          `
          id,
          scheduled_at,
          duration_minutes,
          status,
          service_item_id,
          problem,
          insurance,
          user_note,
          service_items(name,duration_minutes)
        `
        );

      if (error) throw error;

      // ✅ join 타입 차이로 TS가 경고하니 안전하게 unknown 경유
      setItems((data ?? []) as unknown as MyReservation[]);
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMyReservations();
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();

    let arr = [...items];

    if (viewMode === "upcoming") {
      arr = arr.filter((r) => {
        const t = new Date(r.scheduled_at).getTime();
        return t > now && (r.status === "pending" || r.status === "confirmed");
      });

      arr.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
      return arr;
    }

    arr.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
    return arr;
  }, [items, viewMode]);

  async function cancelReservation(resId: string) {
    if (!confirm("이 예약을 취소할까?")) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc("cancel_my_reservation", { res_id: resId });
      if (error) throw error;

      if (!data) {
        alert("취소할 수 없는 예약 상태이거나 권한이 없어요.");
        return;
      }

      await fetchMyReservations();
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <h2 style={{ margin: "8px 0 12px" }}>내 예약</h2>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)} style={{ padding: "10px 12px" }}>
            <option value="upcoming">예정된 예약만</option>
            <option value="all">전체 보기</option>
          </select>

          <button onClick={fetchMyReservations} disabled={loading} style={{ padding: "10px 14px", cursor: "pointer" }}>
            새로고침
          </button>
        </div>
      </div>

      {errorMsg ? (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #f0c", borderRadius: 10 }}>
          오류: {errorMsg}
        </div>
      ) : null}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        {loading && items.length === 0 ? (
          <div style={{ padding: 14, opacity: 0.75 }}>불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 14, opacity: 0.75 }}>
            {viewMode === "upcoming" ? "예정된 예약이 없어요." : "예약 내역이 없어요."}
          </div>
        ) : (
          filtered.map((it) => {
            const si = it.service_items?.[0] ?? null; // ✅ 배열 첫 요소 사용
            const canCancel = (it.status === "pending" || it.status === "confirmed") && isFuture(it.scheduled_at);

            return (
              <div
                key={it.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px",
                  gap: 12,
                  padding: 14,
                  borderTop: "1px solid #e5e7eb",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>
                      {si?.name ?? "정비 아이템"} · {new Date(it.scheduled_at).toLocaleString("ko-KR")}
                    </div>

                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        ...statusStyle(it.status),
                      }}
                    >
                      {statusLabel(it.status)}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    소요: {it.duration_minutes}분{it.insurance ? ` · 보험: ${it.insurance}` : ""}
                  </div>

                  {(it.problem || it.user_note) ? (
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      {it.problem ? <>요청: {it.problem}</> : null}
                      {it.problem && it.user_note ? " · " : null}
                      {it.user_note ? <>메모: {it.user_note}</> : null}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {canCancel ? (
                    <button onClick={() => cancelReservation(it.id)} disabled={loading} style={{ padding: "10px 12px", cursor: "pointer" }}>
                      예약 취소
                    </button>
                  ) : (
                    <div style={{ fontSize: 12, opacity: 0.6, textAlign: "right" }}>
                      {it.status === "canceled"
                        ? "취소됨"
                        : it.status === "completed"
                          ? "완료됨"
                          : it.status === "no_show"
                            ? "노쇼"
                            : "취소 불가"}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        예정된 예약은 <b>미래 예약</b> + <b>대기/확정</b> 상태만 표시됩니다.
      </div>
    </div>
  );
}
