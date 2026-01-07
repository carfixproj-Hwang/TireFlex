// src/pages/AdminCalendarPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminListReservationsByDate, type AdminReservationItem } from "../lib/adminSchedule";
import { adminListBlockedTimesByDate, type AdminBlockedTime } from "../lib/adminSchedule";
import { supabase } from "../lib/supabaseClient";

import "../styles/adminCalendarPremium.css";

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

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function clampText(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

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

      // ✅ 병렬 호출(월 단위라 호출이 많으면 느릴 수 있음. 필요하면 나중에 RPC로 묶어 최적화)
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

  const monthStats = useMemo(() => {
    const vals = Object.values(map);
    const totalRes = vals.reduce((acc, s) => acc + (s.reservations?.length ?? 0), 0);
    const totalBlk = vals.reduce((acc, s) => acc + (s.blocked?.length ?? 0), 0);
    const busyDays = vals.filter((s) => (s.reservations?.length ?? 0) > 0).length;
    return { totalRes, totalBlk, busyDays };
  }, [map]);

  return (
    <div className="calShell">
      <div className="calBg" aria-hidden />

      {/* Top */}
      <div className="calTop">
        <div className="calTopLeft">
          <button className="calIconBtn" onClick={() => setCursor((d) => addMonths(d, -1))} aria-label="이전 달">
            ◀
          </button>

          <div className="calTitle">
            <div className="calTitleMain">{title}</div>
            <div className="calTitleSub">관리자 달력 · 드래그로 날짜 이동</div>
          </div>

          <button className="calIconBtn" onClick={() => setCursor((d) => addMonths(d, 1))} aria-label="다음 달">
            ▶
          </button>
        </div>

        <div className="calTopRight">
          <div className="calChips">
            <span className="calChip">예약 {monthStats.totalRes}</span>
            <span className="calChip calChipOk">활성일 {monthStats.busyDays}</span>
            <span className="calChip calChipDanger">차단 {monthStats.totalBlk}</span>
          </div>

          <button className="calBtn" onClick={loadMonth} disabled={loading || saving}>
            {loading ? "로딩..." : "새로고침"}
          </button>
        </div>
      </div>

      <div className="calHint">
        드래그 드롭: 기본은 <b>기존 시간 유지</b>. <b>Shift</b> 누른 채로 드롭하면 <b>09:00 고정</b>.
        {saving ? <span className="calSaving">이동 반영중…</span> : null}
        {msg ? <span className="calMsg">{msg}</span> : null}
      </div>

      {/* Week header */}
      <div className="calWeekHead">
        {WEEKDAYS.map((w) => (
          <div key={w} className={cx("calWeekName", w === "일" && "calSun", w === "토" && "calSat")}>
            {w}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="calGrid">
        {Array.from({ length: leadingEmpty }).map((_, i) => (
          <div key={`empty-${i}`} className="calCell calCellEmpty" />
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
              className={cx(
                "calCell",
                isSelected && "isSelected",
                isToday && "isToday",
                hasBlocked && "hasBlocked",
                isDragOver && "isDragOver"
              )}
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
              title={ds}
            >
              <div className="calCellTop">
                <div className="calDayNo">
                  {d.getDate()}
                  {isToday ? <span className="calTodayPill">TODAY</span> : null}
                </div>
                <div className="calDayMeta">{ds}</div>
              </div>

              <div className="calBadges">
                <button
                  type="button"
                  className="calPill calPillInfo"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToOpsSchedule(ds);
                  }}
                  title="운영 스케줄(예약)로 이동"
                >
                  예약 {resCount}
                </button>

                <button
                  type="button"
                  className="calPill calPillDanger"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToOpsBlocked(ds);
                  }}
                  title="차단 관리로 이동"
                >
                  차단 {blkCount}
                </button>
              </div>

              {resCount > 0 ? (
                <div className="calList">
                  {s!.reservations.slice(0, 2).map((r) => {
                    const hhmm = kstHHmmFromIso(r.scheduled_at);
                    const isDragging = dragPayload?.reservationId === r.reservation_id;

                    return (
                      <div
                        key={r.reservation_id}
                        className={cx("calItem", isDragging && "isDragging")}
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
                        title={saving ? "이동 처리중…" : `드래그해서 이동 (기본 ${hhmm} 유지, Shift 드롭=09:00)`}
                      >
                        <span className="calBullet">•</span>
                        <span className="calItemText">
                          {r.service_name}
                          <span className="calItemMeta">
                            {" "}
                            · {r.status} · {hhmm}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                  {resCount > 2 ? <div className="calMore">…</div> : null}
                </div>
              ) : (
                <div className="calEmpty">비어있음</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detail Panel */}
      <div className="calPanel">
        <div className="calPanelHead">
          <div className="calPanelTitle">{selectedDateStr} 상세</div>
          <div className="calPanelActions">
            <button type="button" className="calBtnGhost" onClick={() => goToOpsSchedule(selectedDateStr)}>
              운영 스케줄(예약) →
            </button>
          </div>
        </div>

        <div className="calPanelBody">
          <section className="calSection">
            <div className="calSectionHead">
              <div className="calSectionTitle">예약</div>
              <div className="calSectionSub">{selected?.reservations?.length ? `${selected.reservations.length}건` : "0건"}</div>
            </div>

            {selected?.reservations?.length ? (
              <div className="calCards">
                {selected.reservations.map((r) => (
                  <button
                    key={r.reservation_id}
                    type="button"
                    className="calCard"
                    onClick={() => goToOpsSchedule(selectedDateStr, r.reservation_id)}
                    title="운영 스케줄(예약)로 이동"
                  >
                    <div className="calCardTitle">
                      {r.service_name} <span className="calCardDot" aria-hidden>·</span>{" "}
                      <span className="calCardName">{r.full_name ?? "-"}</span>
                      <span className="calCardDot" aria-hidden>·</span> <span className="calCardPhone">{r.phone ?? "-"}</span>
                    </div>
                    <div className="calCardSub">
                      시작: {new Date(r.scheduled_at).toLocaleString("ko-KR")} · {r.duration_minutes}분 · 상태:{" "}
                      <b>{r.status}</b>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="calEmptyLine">예약이 없습니다.</div>
            )}
          </section>

          <section className="calSection">
            <div className="calSectionHead">
              <div className="calSectionTitle">차단</div>
              <button type="button" className="calBtnGhost" onClick={() => goToOpsBlocked(selectedDateStr)}>
                차단 관리로 이동 →
              </button>
            </div>

            {selected?.blocked?.length ? (
              <div className="calCards">
                {selected.blocked.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={cx("calCard", "calCardDanger")}
                    onClick={() => goToOpsBlocked(selectedDateStr)}
                    title="차단 관리로 이동"
                  >
                    <div className="calCardTitle">
                      ⛔ {new Date(b.start_at).toLocaleString("ko-KR")}{" "}
                      <span className="calCardDot" aria-hidden>·</span>{" "}
                      {new Date(b.end_at).toLocaleString("ko-KR")}
                    </div>
                    <div className="calCardSub">{clampText(b.reason) || "-"}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="calEmptyLine">차단이 없습니다.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
