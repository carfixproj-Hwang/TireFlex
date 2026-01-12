// src/pages/AdminCalendarPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminListReservationsByDate, type AdminReservationItem } from "../lib/adminSchedule";
import { adminListBlockedTimesByDate, type AdminBlockedTime } from "../lib/adminSchedule";
import {
  adminAssignReservation,
  adminDeleteReservation,
  adminListAdmins,
  adminMarkReservationCompleted,
  adminSetReservationStatus,
  adminUnassignReservation,
  type AdminUserOption,
  type ReservationStatus,
} from "../lib/adminReservations";
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

function fmtKstFull(iso: string) {
  return new Date(iso).toLocaleString("ko-KR");
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

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "대기",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소",
  no_show: "노쇼",
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

  // ✅ 상세 모달
  const [detailOpen, setDetailOpen] = useState(false);

  // ✅ 모달 내부 작업 지시
  const [admins, setAdmins] = useState<AdminUserOption[]>([]);
  const [myAdminId, setMyAdminId] = useState<string | null>(null);
  const [activeResId, setActiveResId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<ReservationStatus>("pending");
  const [assigneeDraft, setAssigneeDraft] = useState<string>("");
  const [actionBusy, setActionBusy] = useState(false);

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
          return { dateStr: ds, reservations: r, blocked: b } as DaySummary;
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setMyAdminId(data.user?.id ?? null);

      try {
        const list = await adminListAdmins();
        if (!mounted) return;
        setAdmins(list);
      } catch {
        setAdmins([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const selected = map[selectedDateStr] ?? null;

  const activeRes = useMemo(() => {
    if (!selected?.reservations?.length) return null;
    if (!activeResId) return null;
    return selected.reservations.find((r) => r.reservation_id === activeResId) ?? null;
  }, [selected?.reservations, activeResId]);

  useEffect(() => {
    if (!activeRes) return;
    setDraftStatus((activeRes.status as ReservationStatus) ?? "pending");
    setAssigneeDraft((activeRes.assigned_admin_id as string) ?? "");
  }, [activeRes?.reservation_id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const rid = e.dataTransfer.getData("text/plain");
    if (rid) return { reservationId: rid, fromDateStr: "", hhmm: "09:00" } as DragPayload;
    return null;
  }

  const monthStats = useMemo(() => {
    const vals = Object.values(map);
    const totalRes = vals.reduce((acc, s) => acc + (s.reservations?.length ?? 0), 0);
    const totalBlk = vals.reduce((acc, s) => acc + (s.blocked?.length ?? 0), 0);
    const busyDays = vals.filter((s) => (s.reservations?.length ?? 0) > 0).length;
    const completed = vals.reduce((acc, s) => acc + (s.reservations?.filter((r) => r.status === "completed").length ?? 0), 0);
    return { totalRes, totalBlk, busyDays, completed };
  }, [map]);

  const dayCounts = useMemo(() => {
    const resCount = selected?.reservations?.length ?? 0;
    const blkCount = selected?.blocked?.length ?? 0;
    const doneCount = selected?.reservations?.filter((r) => r.status === "completed").length ?? 0;
    return { resCount, blkCount, doneCount };
  }, [selected?.reservations, selected?.blocked]);

  async function refreshSelectedDayKeepModal() {
    try {
      const [r, b] = await Promise.all([adminListReservationsByDate(selectedDateStr), adminListBlockedTimesByDate(selectedDateStr)]);
      setMap((prev) => ({
        ...prev,
        [selectedDateStr]: { dateStr: selectedDateStr, reservations: r, blocked: b },
      }));
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

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
            <div className="calTitleSub">관리자 달력 · 클릭=상세/작업 · 드래그=날짜 이동</div>
          </div>

          <button className="calIconBtn" onClick={() => setCursor((d) => addMonths(d, 1))} aria-label="다음 달">
            ▶
          </button>
        </div>

        <div className="calTopRight">
          <div className="calChips">
            <span className="calChip">예약 {monthStats.totalRes}</span>
            <span className="calChip calChipOk">완료 {monthStats.completed}</span>
            <span className="calChip calChipOk">활성일 {monthStats.busyDays}</span>
            <span className="calChip calChipDanger">차단 {monthStats.totalBlk}</span>
          </div>

          <button className="calBtn" onClick={loadMonth} disabled={loading || saving || actionBusy}>
            {loading ? "로딩..." : "새로고침"}
          </button>
        </div>
      </div>

      <div className="calHint">
        드래그 드롭: 기본은 <b>기존 시간 유지</b>. <b>Shift</b> 누른 채로 드롭하면 <b>09:00 고정</b>.
        {saving ? <span className="calSaving">이동 반영중…</span> : null}
        {actionBusy ? <span className="calSaving">작업 처리중…</span> : null}
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
          <div key={`empty-${i}`} className="calCell calCellEmpty" style={{ gridColumn: "auto / span 1" }} aria-hidden />
        ))}

        {days.map((d) => {
          const ds = ymd(d);
          const s = map[ds];

          const resCount = s?.reservations?.length ?? 0;
          const blkCount = s?.blocked?.length ?? 0;
          const doneCount = s?.reservations?.filter((r) => r.status === "completed").length ?? 0;

          const isSelected = ds === selectedDateStr;
          const isToday = ds === ymd(new Date());
          const hasBlocked = blkCount > 0;

          const isDragOver = dragOverDate === ds && !!dragPayload;

          return (
            <div
              key={ds}
              className={cx("calCell", isSelected && "isSelected", isToday && "isToday", hasBlocked && "hasBlocked", isDragOver && "isDragOver")}
              onClick={() => {
                setSelectedDateStr(ds);
                setActiveResId(null);
                setDetailOpen(true);
              }}
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
                  className="calPill calPillOk"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDateStr(ds);
                    setActiveResId(null);
                    setDetailOpen(true);
                  }}
                  title="완료/예약 상세"
                >
                  완료 {doneCount}
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
                        draggable={!saving && !actionBusy}
                        onDragStart={(e) => {
                          if (saving || actionBusy) return;

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
                          setSelectedDateStr(ds);
                          setActiveResId(r.reservation_id);
                          setDetailOpen(true);
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

      {/* ✅ 상세/작업 모달 */}
      {detailOpen ? (
        <div
          className="calModalBackdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailOpen(false);
          }}
        >
          <div className="calModalPanel">
            <div className="calModalHead">
              <div>
                <div className="calModalTitle">{selectedDateStr} 상세</div>
                <div className="calModalSub">예약 클릭 → 아래에서 상태/담당자/완료/삭제 작업</div>
              </div>

              <div className="calModalHeadActions">
                <button type="button" className="calBtnGhost" onClick={() => goToOpsSchedule(selectedDateStr)}>
                  운영 스케줄(예약) →
                </button>
                <button type="button" className="calBtnGhost" onClick={() => goToOpsBlocked(selectedDateStr)}>
                  차단 관리 →
                </button>
                <button
                  type="button"
                  className="calIconBtn"
                  onClick={() => {
                    setDetailOpen(false);
                    setActiveResId(null);
                  }}
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="calModalBody">
              <div className="calModalSummaryRow">
                <span className="calChip">예약 {dayCounts.resCount}</span>
                <span className="calChip calChipOk">완료 {dayCounts.doneCount}</span>
                <span className="calChip calChipDanger">차단 {dayCounts.blkCount}</span>
              </div>

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
                        className={cx("calCard", activeResId === r.reservation_id && "isActive")}
                        onClick={() => setActiveResId(r.reservation_id)}
                        title="클릭해서 아래에서 작업"
                      >
                        <div className="calCardTitle">
                          {r.service_name} <span className="calCardDot" aria-hidden>·</span>{" "}
                          <span className="calCardName">{r.full_name ?? "-"}</span>
                          <span className="calCardDot" aria-hidden>·</span>{" "}
                          <span className="calCardPhone">{r.phone ?? "-"}</span>
                        </div>
                        <div className="calCardSub">
                          시작: {fmtKstFull(r.scheduled_at)} · {r.duration_minutes}분 · 상태:{" "}
                          <b>{STATUS_LABEL[(r.status as ReservationStatus) ?? "pending"] ?? r.status}</b>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="calEmptyLine">예약이 없습니다.</div>
                )}
              </section>

              {/* ✅ 작업 지시 패널 */}
              {activeRes ? (
                <section className="calWorkPanel">
                  <div className="calWorkHead">
                    <div className="calWorkTitle">작업 지시</div>
                    <button type="button" className="calBtnGhost" onClick={() => setActiveResId(null)}>
                      닫기
                    </button>
                  </div>

                  <div className="calWorkBody">
                    <div className="calWorkInfo">
                      <div className="calWorkInfoMain">
                        <b>{activeRes.service_name}</b> · {activeRes.full_name ?? "-"} ({activeRes.phone ?? "-"})
                      </div>
                      <div className="calWorkInfoSub">
                        시작: {fmtKstFull(activeRes.scheduled_at)} · {activeRes.duration_minutes}분 · 상태:{" "}
                        <b>{STATUS_LABEL[(activeRes.status as ReservationStatus) ?? "pending"] ?? activeRes.status}</b>
                      </div>
                    </div>

                    <div className="calWorkControls">
                      <div className="calField">
                        <div className="calFieldLabel">상태</div>
                        <select
                          className="calSelect"
                          value={draftStatus}
                          onChange={(e) => setDraftStatus(e.target.value as ReservationStatus)}
                          disabled={actionBusy}
                        >
                          {(["pending", "confirmed", "completed", "canceled", "no_show"] as ReservationStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        className="calBtn"
                        disabled={actionBusy || draftStatus === (activeRes.status as ReservationStatus)}
                        onClick={async () => {
                          try {
                            setActionBusy(true);
                            setMsg(null);
                            const ok = await adminSetReservationStatus(activeRes.reservation_id, draftStatus);
                            if (!ok) throw new Error("상태 변경 실패");
                            await refreshSelectedDayKeepModal();
                          } catch (e: any) {
                            setMsg(e?.message ?? String(e));
                          } finally {
                            setActionBusy(false);
                          }
                        }}
                        title="상태 적용"
                      >
                        상태 적용
                      </button>

                      <div className="calField">
                        <div className="calFieldLabel">담당자</div>
                        <select
                          className="calSelect"
                          value={assigneeDraft}
                          onChange={(e) => setAssigneeDraft(e.target.value)}
                          disabled={actionBusy}
                        >
                          <option value="">(미배정)</option>
                          {admins.map((a) => (
                            <option key={a.user_id} value={a.user_id}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        className="calBtnGhost"
                        disabled={actionBusy || !assigneeDraft}
                        onClick={async () => {
                          try {
                            if (!assigneeDraft) throw new Error("배정할 담당자를 선택하세요.");
                            setActionBusy(true);
                            setMsg(null);
                            const ok = await adminAssignReservation(activeRes.reservation_id, assigneeDraft);
                            if (!ok) throw new Error("배정 실패");
                            await refreshSelectedDayKeepModal();
                          } catch (e: any) {
                            setMsg(e?.message ?? String(e));
                          } finally {
                            setActionBusy(false);
                          }
                        }}
                        title="담당자 배정"
                      >
                        담당자 배정
                      </button>

                      <button
                        type="button"
                        className="calBtnGhost"
                        disabled={actionBusy || !activeRes.assigned_admin_id}
                        onClick={async () => {
                          try {
                            setActionBusy(true);
                            setMsg(null);
                            const ok = await adminUnassignReservation(activeRes.reservation_id);
                            if (!ok) throw new Error("배정 해제 실패");
                            setAssigneeDraft("");
                            await refreshSelectedDayKeepModal();
                          } catch (e: any) {
                            setMsg(e?.message ?? String(e));
                          } finally {
                            setActionBusy(false);
                          }
                        }}
                        title="배정 해제"
                      >
                        배정 해제
                      </button>

                      <button
                        type="button"
                        className="calBtnOk"
                        disabled={actionBusy || activeRes.status === "completed"}
                        onClick={async () => {
                          try {
                            setActionBusy(true);
                            setMsg(null);
                            const ok = await adminMarkReservationCompleted(activeRes.reservation_id);
                            if (!ok) throw new Error("완료 처리 실패");
                            setDraftStatus("completed");
                            await refreshSelectedDayKeepModal();
                          } catch (e: any) {
                            setMsg(e?.message ?? String(e));
                          } finally {
                            setActionBusy(false);
                          }
                        }}
                        title={`완료 처리(기록)${myAdminId ? ` · 완료자=${myAdminId}` : ""}`}
                      >
                        완료 처리(기록)
                      </button>

                      <button
                        type="button"
                        className="calBtnDanger"
                        disabled={actionBusy}
                        onClick={async () => {
                          const ok1 = confirm("이 예약을 DB에서 완전히 삭제할까요? (되돌릴 수 없음)");
                          if (!ok1) return;
                          const ok2 = confirm("정말 삭제할까요? 삭제하면 기록이 사라집니다.");
                          if (!ok2) return;

                          try {
                            setActionBusy(true);
                            setMsg(null);
                            const ok = await adminDeleteReservation(activeRes.reservation_id);
                            if (!ok) throw new Error("삭제 실패");
                            setActiveResId(null);
                            await refreshSelectedDayKeepModal();
                          } catch (e: any) {
                            setMsg(e?.message ?? String(e));
                          } finally {
                            setActionBusy(false);
                          }
                        }}
                        title="예약 삭제"
                      >
                        예약 삭제
                      </button>

                      <button
                        type="button"
                        className="calBtnGhost"
                        disabled={actionBusy}
                        onClick={() => goToOpsSchedule(selectedDateStr, activeRes.reservation_id)}
                        title="원래 운영(스케줄) 화면에서 보기"
                      >
                        운영 화면에서 보기 →
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}

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
                          ⛔ {fmtKstFull(b.start_at)} <span className="calCardDot" aria-hidden>·</span> {fmtKstFull(b.end_at)}
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

            <div className="calModalFoot">
              <div className="calModalFootHint">
                팁: 셀 안의 예약은 <b>드래그</b>로 날짜 이동 가능 (Shift 드롭 = 09:00 고정)
              </div>
              <button
                type="button"
                className="calBtn"
                onClick={() => {
                  setDetailOpen(false);
                  setActiveResId(null);
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
