// src/pages/AdminCalendarPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminListReservationsByDate, type AdminReservationItem } from "../lib/adminSchedule";
import { adminListBlockedTimesByDate, type AdminBlockedTime } from "../lib/adminSchedule";
import { supabase } from "../lib/supabaseClient";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function isoAtKst(dateStr: string, hhmm: string) {
  return `${dateStr}T${hhmm}:00+09:00`;
}

function kstHHmmFromIso(iso: string) {
  const dt = new Date(iso);
  const k = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
  const hh = pad2(k.getUTCHours());
  const mm = pad2(k.getUTCMinutes());
  return `${hh}:${mm}`;
}

type DaySummary = {
  dateStr: string;
  reservations: AdminReservationItem[];
  blocked: AdminBlockedTime[];
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type DragPayload = {
  reservationId: string;
  fromDateStr: string;
  hhmm: string; // 원래 시간(KST)
};

export default function AdminCalendarPage() {
  const navigate = useNavigate();

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => ymd(new Date()));
  const [map, setMap] = useState<Record<string, DaySummary>>({});

  // ✅ Drag & Drop 상태
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const monthEnd = useMemo(() => endOfMonth(cursor), [cursor]);
  const title = useMemo(() => monthKey(cursor), [cursor]);

  const days = useMemo(() => {
    const out: Date[] = [];
    const d = new Date(monthStart);
    while (d <= monthEnd) {
      out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [monthStart, monthEnd]);

  const leadingEmpty = useMemo(() => monthStart.getDay(), [monthStart]);

  async function loadMonth() {
    setLoading(true);
    setMsg(null);
    try {
      const dateStrs = days.map((d) => ymd(d));

      const results = await Promise.all(
        dateStrs.map(async (ds) => {
          const [r, b] = await Promise.all([adminListReservationsByDate(ds), adminListBlockedTimesByDate(ds)]);
          const summary: DaySummary = { dateStr: ds, reservations: r, blocked: b };
          return summary;
        })
      );

      const next: Record<string, DaySummary> = {};
      for (const s of results) next[s.dateStr] = s;

      setMap(next);

      if (!next[selectedDateStr]) {
        setSelectedDateStr(dateStrs[0] ?? selectedDateStr);
      }
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  const selected = map[selectedDateStr] ?? null;

  const cellStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 10,
    minHeight: 92,
    cursor: "pointer",
    background: "#fff",
    display: "grid",
    gap: 6,
    alignContent: "start",
  };

  function goToOps(dateStr: string, tab: "schedule" | "blocked", focusReservationId?: string) {
    const qs = new URLSearchParams();
    qs.set("date", dateStr);
    qs.set("tab", tab);
    if (focusReservationId) qs.set("focus", focusReservationId);
    navigate(`/admin?${qs.toString()}`);
  }

  function goToOpsSchedule(dateStr: string, reservationId?: string) {
    goToOps(dateStr, "schedule", reservationId);
  }

  function goToOpsBlocked(dateStr: string) {
    goToOps(dateStr, "blocked");
  }

  async function reschedule(reservationId: string, targetDateStr: string, hhmm: string) {
    const newStart = isoAtKst(targetDateStr, hhmm);

    const { data, error } = await supabase.rpc("admin_reschedule_reservation", {
      res_id: reservationId,
      new_start: newStart,
    });

    if (error) throw new Error(error.message);
    if (!data) throw new Error("시간 변경 실패");
  }

  function readDragPayloadFromEvent(e: React.DragEvent) {
    const rawJson = e.dataTransfer.getData("application/json");
    if (rawJson) {
      try {
        const p = JSON.parse(rawJson) as DragPayload;
        if (p?.reservationId && p?.fromDateStr && p?.hhmm) return p;
      } catch {}
    }

    // fallback: text/plain = reservationId only
    const rid = e.dataTransfer.getData("text/plain");
    if (rid) {
      return { reservationId: rid, fromDateStr: "", hhmm: "09:00" } as DragPayload;
    }
    return null;
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setCursor((d) => addMonths(d, -1))} style={{ padding: "8px 10px", cursor: "pointer" }}>
            ◀
          </button>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{title} 달력</div>
          <button onClick={() => setCursor((d) => addMonths(d, 1))} style={{ padding: "8px 10px", cursor: "pointer" }}>
            ▶
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={loadMonth} disabled={loading || saving} style={{ padding: "8px 10px", cursor: "pointer" }}>
            {loading ? "로딩..." : "새로고침"}
          </button>
          {saving ? <span style={{ fontSize: 12, opacity: 0.75 }}>이동 반영중…</span> : null}
          {msg ? <span style={{ color: "crimson" }}>{msg}</span> : null}
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
        드래그 드롭: 기본은 <b>기존 시간 유지</b>. <b>Shift</b> 누른 채로 드롭하면 <b>09:00 고정</b>.
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ fontWeight: 900, opacity: 0.8, padding: "0 4px" }}>
            {w}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
        {Array.from({ length: leadingEmpty }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {days.map((d) => {
          const ds = ymd(d);
          const s = map[ds];
          const resCount = s?.reservations?.length ?? 0;
          const blkCount = s?.blocked?.length ?? 0;

          const isSelected = ds === selectedDateStr;
          const isToday = ds === ymd(new Date());
          const hasBlocked = blkCount > 0;

          const isDragOver = dragOverDate === ds && !!dragPayload;

          return (
            <div
              key={ds}
              onClick={() => setSelectedDateStr(ds)}
              onDragOver={(e) => {
                if (!dragPayload) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverDate(ds);
              }}
              onDragLeave={() => {
                if (dragOverDate === ds) setDragOverDate(null);
              }}
              onDrop={async (e) => {
                e.preventDefault();

                const p = dragPayload ?? readDragPayloadFromEvent(e);
                setDragOverDate(null);

                if (!p?.reservationId) return;

                const hhmm = e.shiftKey ? "09:00" : p.hhmm;

                try {
                  setSaving(true);
                  setMsg(null);

                  await reschedule(p.reservationId, ds, hhmm);
                  await loadMonth();
                  setSelectedDateStr(ds);
                } catch (err: any) {
                  setMsg(err?.message ?? String(err));
                } finally {
                  setSaving(false);
                  setDragPayload(null);
                }
              }}
              style={{
                ...cellStyle,
                border: isSelected ? "2px solid #111827" : "1px solid #e5e7eb",
                boxShadow: isSelected ? "0 0 0 2px rgba(17,24,39,0.05)" : undefined,
                background: hasBlocked ? "#fff1f2" : "#fff",
                outline: isDragOver ? "2px solid #111827" : "none",
                outlineOffset: -2,
                opacity: saving ? 0.85 : 1,
              }}
              title={ds}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 900 }}>
                  {d.getDate()}
                  {isToday ? <span style={{ marginLeft: 6, fontSize: 12, color: "#2563eb" }}>TODAY</span> : null}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{ds}</div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToOpsSchedule(ds);
                  }}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid #dbeafe",
                    background: "#eff6ff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                  title="운영 스케줄(예약)로 이동"
                >
                  예약 {resCount}
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToOpsBlocked(ds);
                  }}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid #fecaca",
                    background: "#fff1f2",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                  title="차단 관리로 이동"
                >
                  차단 {blkCount}
                </button>
              </div>

              {resCount > 0 ? (
                <div style={{ fontSize: 12, opacity: 0.9 }}>
                  {s!.reservations.slice(0, 2).map((r) => {
                    const hhmm = kstHHmmFromIso(r.scheduled_at);
                    const isDragging = dragPayload?.reservationId === r.reservation_id;

                    return (
                      <div
                        key={r.reservation_id}
                        draggable={!saving}
                        onDragStart={(e) => {
                          if (saving) return;

                          const payload: DragPayload = {
                            reservationId: r.reservation_id,
                            fromDateStr: ds,
                            hhmm,
                          };

                          setDragPayload(payload);

                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", payload.reservationId);
                          e.dataTransfer.setData("application/json", JSON.stringify(payload));
                        }}
                        onDragEnd={() => {
                          setDragPayload(null);
                          setDragOverDate(null);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          goToOpsSchedule(ds, r.reservation_id);
                        }}
                        style={{
                          display: "block",
                          marginTop: 2,
                          cursor: saving ? "default" : "grab",
                          userSelect: "none",
                          padding: "2px 0",
                          color: "#111827",
                          opacity: isDragging ? 0.6 : 1,
                        }}
                        title={saving ? "이동 처리중…" : `드래그해서 이동 (기본 ${hhmm} 유지, Shift 드롭=09:00)`}
                      >
                        • {r.service_name} ({r.status}){" "}
                        <span style={{ fontSize: 11, opacity: 0.7 }}>{hhmm}</span>
                      </div>
                    );
                  })}
                  {resCount > 2 ? <div>…</div> : null}
                </div>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.55 }}>비어있음</div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <div
          style={{
            background: "#f9fafb",
            padding: 10,
            fontWeight: 900,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>{selectedDateStr} 상세</div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => goToOpsSchedule(selectedDateStr)} style={{ padding: "8px 10px", cursor: "pointer" }}>
              운영 스케줄(예약) →
            </button>
          </div>
        </div>

        <div style={{ padding: 12, display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>예약</div>
            {selected?.reservations?.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {selected.reservations.map((r) => (
                  <button
                    key={r.reservation_id}
                    type="button"
                    onClick={() => goToOpsSchedule(selectedDateStr, r.reservation_id)}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      padding: 10,
                      background: "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    title="운영 스케줄(예약)로 이동"
                  >
                    <div style={{ fontWeight: 900 }}>
                      {r.service_name} · {r.full_name ?? "-"} · {r.phone ?? "-"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      시작: {new Date(r.scheduled_at).toLocaleString("ko-KR")} · {r.duration_minutes}분 · 상태: {r.status}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.65 }}>예약이 없습니다.</div>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 900, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>차단</span>
              <button type="button" onClick={() => goToOpsBlocked(selectedDateStr)} style={{ padding: "8px 10px", cursor: "pointer" }}>
                차단 관리로 이동 →
              </button>
            </div>

            {selected?.blocked?.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {selected.blocked.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => goToOpsBlocked(selectedDateStr)}
                    style={{
                      border: "1px solid #fecaca",
                      borderRadius: 12,
                      padding: 10,
                      background: "#fff1f2",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    title="차단 관리로 이동"
                  >
                    <div style={{ fontWeight: 900 }}>
                      ⛔ {new Date(b.start_at).toLocaleString("ko-KR")} ~ {new Date(b.end_at).toLocaleString("ko-KR")}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{b.reason ?? "-"}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.65 }}>차단이 없습니다.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
