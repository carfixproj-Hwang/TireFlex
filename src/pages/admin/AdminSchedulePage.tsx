// src/pages/admin/AdminSchedulePage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  adminAssignReservation,
  adminDeleteReservation,
  adminListAdmins,
  adminListReservationsByDate,
  adminMarkReservationCompleted,
  adminSetReservationStatus,
  adminUnassignReservation,
  type AdminReservationRow,
  type AdminUserOption,
  type ReservationStatus,
} from "../../lib/adminReservations";
import { adminListBlockedTimesByDate, type AdminBlockedTime } from "../../lib/adminSchedule";
import { supabase } from "../../lib/supabaseClient";

import "../../styles/adminScheduleReservationModal.css";

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

function fmtKst(iso: string) {
  return new Date(iso).toLocaleString("ko-KR");
}

function fmtTimeKst(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function isDayBased(durationMinutes: number) {
  return durationMinutes >= 1440 && durationMinutes % 1440 === 0;
}

function kstDateStringFromIso(iso: string) {
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = k.getUTCFullYear();
  const m = String(k.getUTCMonth() + 1).padStart(2, "0");
  const day = String(k.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeHHmm(v: unknown, fallback: string) {
  if (v == null) return fallback;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return fallback;
  const hh = clampInt(Number(m[1]), 0, 23);
  const mm = clampInt(Number(m[2]), 0, 59);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function hhmmToMinutes(hhmm: string) {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const hh = clampInt(Number(m[1]), 0, 23);
  const mm = clampInt(Number(m[2]), 0, 59);
  return hh * 60 + mm;
}

function minutesToHHmm(totalMinutes: number) {
  const t = clampInt(totalMinutes, 0, 24 * 60 - 1);
  const hh = Math.floor(t / 60);
  const mm = t % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "대기",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소",
  no_show: "노쇼",
};

type SlotRow = {
  startIso: string; // KST ISO(+09)
  endIso: string;
  blocked: AdminBlockedTime | null;
  reservations: AdminReservationRow[];
};

function indicatingDraggableHint(durationMinutes: number, saving: boolean) {
  if (saving) return true;
  return durationMinutes >= 1440 && durationMinutes % 1440 === 0;
}

function chipStyle(kind: "info" | "warn" | "danger" | "ok"): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "-0.2px",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.92)",
    background: "rgba(255,255,255,0.06)",
    whiteSpace: "nowrap",
  };
  if (kind === "warn") return { ...base, border: "1px solid rgba(251,191,36,0.28)", background: "rgba(251,191,36,0.10)" };
  if (kind === "danger") return { ...base, border: "1px solid rgba(251,113,133,0.30)", background: "rgba(251,113,133,0.12)" };
  if (kind === "ok") return { ...base, border: "1px solid rgba(110,231,183,0.28)", background: "rgba(110,231,183,0.10)" };
  return base;
}

function SelectField({
  value,
  onChange,
  disabled,
  children,
  ariaLabel,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: any;
  ariaLabel: string;
  style?: CSSProperties;
}) {
  const wrap: CSSProperties = { position: "relative", display: "inline-flex", alignItems: "center", ...style };
  const select: CSSProperties = {
    padding: "11px 44px 11px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(12,18,32,0.92)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
  };
  const arrow: CSSProperties = {
    position: "absolute",
    right: 12,
    pointerEvents: "none",
    fontSize: 12,
    opacity: 0.9,
    color: "rgba(255,255,255,0.88)",
  };
  return (
    <div style={wrap}>
      <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={select}>
        {children}
      </select>
      <span style={arrow} aria-hidden>
        ▾
      </span>
    </div>
  );
}

export default function AdminSchedulePage() {
  const location = useLocation();
  const navigate = useNavigate();

  const styles = useMemo(() => {
    const bg: CSSProperties = {
      position: "fixed",
      inset: 0,
      zIndex: -1,
      background:
        "radial-gradient(900px 420px at 18% 8%, rgba(255,255,255,0.10), transparent 60%), radial-gradient(800px 420px at 82% 12%, rgba(255,255,255,0.07), transparent 62%), linear-gradient(180deg, #0b1220, #070b14)",
    };

    const shell: CSSProperties = { maxWidth: 1120, margin: "0 auto", padding: 10 };
    const h1: CSSProperties = { margin: "0 0 10px 0", color: "rgba(255,255,255,0.94)", fontWeight: 950, letterSpacing: "-0.6px" };

    const glass: CSSProperties = {
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 18,
      background: "rgba(255,255,255,0.05)",
      backdropFilter: "blur(10px)",
      boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
      overflow: "hidden",
    };

    const topbar: CSSProperties = {
      padding: 12,
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
    };

    const controlRow: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" };

    const label: CSSProperties = { fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.90)" };

    const input: CSSProperties = {
      padding: "11px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(12,18,32,0.75)",
      color: "rgba(255,255,255,0.92)",
      outline: "none",
      boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
    };

    const btnPrimary: CSSProperties = {
      padding: "11px 14px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.92)",
      color: "#0b0f18",
      fontWeight: 950,
      cursor: "pointer",
      boxShadow: "0 16px 34px rgba(0,0,0,0.35)",
    };

    const btnDark: CSSProperties = {
      padding: "11px 14px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(12,18,32,0.75)",
      color: "rgba(255,255,255,0.92)",
      fontWeight: 950,
      cursor: "pointer",
      boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
    };

    const gridHead: CSSProperties = {
      padding: 12,
      fontWeight: 950,
      color: "rgba(255,255,255,0.92)",
      background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
      borderBottom: "1px solid rgba(255,255,255,0.10)",
    };

    const slotRow: CSSProperties = {
      display: "grid",
      gridTemplateColumns: "100px 1fr",
      gap: 12,
      padding: 12,
      borderTop: "1px solid rgba(255,255,255,0.08)",
      alignItems: "start",
    };

    const timePill: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 10px",
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.92)",
      fontWeight: 950,
      letterSpacing: "-0.2px",
      boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
    };

    const empty: CSSProperties = { fontSize: 12, opacity: 0.65, color: "rgba(255,255,255,0.86)" };

    const resBtn: CSSProperties = {
      textAlign: "left",
      padding: "10px 12px",
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.92)",
      cursor: "pointer",
      boxShadow: "0 14px 34px rgba(0,0,0,0.30)",
    };

    const resBtnActive: CSSProperties = {
      ...resBtn,
      background: "rgba(255,255,255,0.88)",
      color: "#0b0f18",
      border: "1px solid rgba(255,255,255,0.32)",
    };

    const msgBar: CSSProperties = {
      marginTop: 10,
      padding: 10,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.92)",
    };

    return {
      bg,
      shell,
      h1,
      glass,
      topbar,
      controlRow,
      label,
      input,
      btnPrimary,
      btnDark,
      gridHead,
      slotRow,
      timePill,
      empty,
      resBtn,
      resBtnActive,
      msgBar,
    };
  }, []);

  const replaceSearch = (patch: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(location.search);
    patch(sp);
    navigate({ pathname: location.pathname, search: `?${sp.toString()}` }, { replace: true });
  };

  const [dateStr, setDateStr] = useState(() => {
    const sp = new URLSearchParams(location.search);
    const q = sp.get("date");
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : toDateInputValue(new Date());
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [reservations, setReservations] = useState<AdminReservationRow[]>([]);
  const [blocked, setBlocked] = useState<AdminBlockedTime[]>([]);

  const [activeResId, setActiveResId] = useState<string | null>(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("focus") || null;
  });

  const [draftStatus, setDraftStatus] = useState<ReservationStatus>("pending");
  const [saving, setSaving] = useState(false);

  const [admins, setAdmins] = useState<AdminUserOption[]>([]);
  const [myAdminId, setMyAdminId] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [assigneeDraft, setAssigneeDraft] = useState<string>("");

  const [dragResId, setDragResId] = useState<string | null>(null);
  const [dragOverSlotStart, setDragOverSlotStart] = useState<string | null>(null);

  // ✅ ops_settings 기반 운영시간/슬롯
  const [openHHmm, setOpenHHmm] = useState<string>("09:00");
  const [closeHHmm, setCloseHHmm] = useState<string>("18:00");
  const [slotMinutes, setSlotMinutes] = useState<number>(30);
  const [tz, setTz] = useState<string>("Asia/Seoul");
  const [capacity, setCapacity] = useState<number>(1);

  // ✅ 리프트(동시작업) 용량
  const [liftCap, setLiftCap] = useState<number>(1);
  const [liftDraft, setLiftDraft] = useState<number>(1);
  const [liftSaving, setLiftSaving] = useState<boolean>(false);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const qDate = sp.get("date");
    const qFocus = sp.get("focus");

    if (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate) && qDate !== dateStr) {
      setDateStr(qDate);
    }
    if ((qFocus || null) !== (activeResId || null)) {
      setActiveResId(qFocus || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const adminLabelById = useMemo(() => {
    const m = new Map<string, string>();
    admins.forEach((a) => m.set(a.user_id, a.label));
    return m;
  }, [admins]);

  const visibleReservations = useMemo(() => {
    if (!onlyMine || !myAdminId) return reservations;
    return reservations.filter((r) => r.assigned_admin_id === myAdminId);
  }, [onlyMine, myAdminId, reservations]);

  const activeRes = useMemo(() => {
    if (!activeResId) return null;
    return reservations.find((r) => r.reservation_id === activeResId) ?? null;
  }, [activeResId, reservations]);

  useEffect(() => {
    replaceSearch((sp) => {
      sp.set("tab", "schedule");
      sp.set("date", dateStr);
      sp.delete("focus");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr]);

  useEffect(() => {
    if (!activeResId) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResId]);

  useEffect(() => {
    if (!activeRes) return;
    setDraftStatus(activeRes.status);
    setAssigneeDraft(activeRes.assigned_admin_id ?? "");
  }, [activeRes?.reservation_id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const isCapacityConsumer = (status: ReservationStatus) => status !== "canceled" && status !== "no_show";

  const workdayMinutes = useMemo(() => {
    const o = hhmmToMinutes(openHHmm);
    const c = hhmmToMinutes(closeHHmm);
    const diff = c - o;
    return diff > 0 ? diff : 540;
  }, [openHHmm, closeHHmm]);

  function computeDayBasedWindow(scheduledAtIso: string, durationMinutes: number) {
    const base = kstDateStringFromIso(scheduledAtIso);
    const days = durationMinutes / 1440;

    const start = isoAtKst(base, openHHmm);

    const endDate = new Date(`${base}T00:00:00+09:00`);
    endDate.setDate(endDate.getDate() + days);
    const endY = endDate.getFullYear();
    const endM = String(endDate.getMonth() + 1).padStart(2, "0");
    const endD = String(endDate.getDate()).padStart(2, "0");
    const end = isoAtKst(`${endY}-${endM}-${endD}`, closeHHmm);

    return { start, end, base, days };
  }

  const safeSlotMinutes = useMemo(() => clampInt(Number(slotMinutes || 30), 5, 240), [slotMinutes]);

  const slots = useMemo(() => {
    const rows: SlotRow[] = [];

    const openMin = hhmmToMinutes(openHHmm);
    const closeMin = hhmmToMinutes(closeHHmm);

    if (closeMin <= openMin) return rows;

    for (let t = openMin; t + safeSlotMinutes <= closeMin; t += safeSlotMinutes) {
      const hhmm = minutesToHHmm(t);
      const endHhmm = minutesToHHmm(t + safeSlotMinutes);

      const startIso = isoAtKst(dateStr, hhmm);
      const endIso = isoAtKst(dateStr, endHhmm);

      const b = blocked.find((bt) => overlaps(bt.start_at, bt.end_at, startIso, endIso)) ?? null;

      const rs = visibleReservations.filter((r) => {
        if (isDayBased(r.duration_minutes)) {
          const w = computeDayBasedWindow(r.scheduled_at, r.duration_minutes);
          return overlaps(w.start, w.end, startIso, endIso);
        }
        const rEnd = addMinutesIso(r.scheduled_at, r.duration_minutes);
        return overlaps(r.scheduled_at, rEnd, startIso, endIso);
      });

      rows.push({ startIso, endIso, blocked: b, reservations: rs });
    }

    return rows;
  }, [dateStr, visibleReservations, blocked, openHHmm, closeHHmm, safeSlotMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    setLoading(true);
    setMsg(null);
    try {
      const [r, b, o] = await Promise.all([
        adminListReservationsByDate(dateStr),
        adminListBlockedTimesByDate(dateStr),
        supabase.from("ops_settings").select("max_batch_qty,open_time,close_time,slot_minutes,capacity,tz").eq("id", 1).maybeSingle(),
      ]);

      setReservations(r);
      setBlocked(b);

      if (!o.error) {
        const capLift = clampInt(Number((o.data as any)?.max_batch_qty ?? 1), 1, 20);
        setLiftCap(capLift);
        setLiftDraft(capLift);

        setOpenHHmm(normalizeHHmm((o.data as any)?.open_time, "09:00"));
        setCloseHHmm(normalizeHHmm((o.data as any)?.close_time, "18:00"));

        const sm = (o.data as any)?.slot_minutes;
        setSlotMinutes(clampInt(Number(sm ?? 30), 5, 240));

        const cap = (o.data as any)?.capacity;
        setCapacity(clampInt(Number(cap ?? 1), 1, 50));

        const tzVal = (o.data as any)?.tz;
        setTz(tzVal ? String(tzVal) : "Asia/Seoul");
      } else {
        setLiftCap(1);
        setLiftDraft(1);
        setOpenHHmm("09:00");
        setCloseHHmm("18:00");
        setSlotMinutes(30);
        setCapacity(1);
        setTz("Asia/Seoul");
      }

      const sp = new URLSearchParams(location.search);
      const focus = sp.get("focus");
      if (focus && !r.some((x) => x.reservation_id === focus)) {
        replaceSearch((sp2) => sp2.delete("focus"));
      }
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

  async function saveLiftCapacity() {
    const cap = clampInt(Number(liftDraft), 1, 20);
    try {
      setLiftSaving(true);
      setMsg(null);

      const { error } = await supabase.from("ops_settings").upsert({ id: 1, max_batch_qty: cap }, { onConflict: "id" });
      if (error) throw new Error(error.message);

      setLiftCap(cap);
      setLiftDraft(cap);
      await refresh();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLiftSaving(false);
    }
  }

  const activeTimeInfo = useMemo(() => {
    if (!activeRes) return null;

    if (isDayBased(activeRes.duration_minutes)) {
      const w = computeDayBasedWindow(activeRes.scheduled_at, activeRes.duration_minutes);
      return {
        start: w.start,
        end: w.end,
        label: `${w.base} ${openHHmm} ~ ${kstDateStringFromIso(w.end)} ${closeHHmm} (${w.days}일)`,
      };
    }

    const end = addMinutesIso(activeRes.scheduled_at, activeRes.duration_minutes);
    return {
      start: activeRes.scheduled_at,
      end,
      label: `${fmtTimeKst(activeRes.scheduled_at)} ~ ${fmtTimeKst(end)} (${activeRes.duration_minutes}분)`,
    };
  }, [activeRes, openHHmm, closeHHmm]); // eslint-disable-line react-hooks/exhaustive-deps

  function mustStartAtOpenFor(r: AdminReservationRow) {
    return r.duration_minutes === workdayMinutes;
  }

  function isOpenSlot(startIso: string) {
    return startIso.includes(`T${openHHmm}:00+09:00`);
  }

  function computeCandidateEnd(r: AdminReservationRow, candStart: string) {
    return addMinutesIso(candStart, r.duration_minutes);
  }

  function isBlockedByList(candStart: string, candEnd: string) {
    return blocked.some((bt) => overlaps(bt.start_at, bt.end_at, candStart, candEnd));
  }

  // ✅ 리프트 용량 기반: 슬롯 단위로 "동시 겹침 최대값"으로 판단
  function isActiveStatus(s: ReservationStatus) {
    return s !== "canceled" && s !== "no_show";
  }

  function getResWindow(r: AdminReservationRow) {
    if (isDayBased(r.duration_minutes)) {
      const w = computeDayBasedWindow(r.scheduled_at, r.duration_minutes);
      return { start: w.start, end: w.end };
    }
    return { start: r.scheduled_at, end: addMinutesIso(r.scheduled_at, r.duration_minutes) };
  }

  function maxOtherOverlapsInWindow(resId: string, candStart: string, candEnd: string) {
    const stepMs = safeSlotMinutes * 60 * 1000;
    const s0 = new Date(candStart).getTime();
    const e0 = new Date(candEnd).getTime();
    let max = 0;

    for (let t = s0; t < e0; t += stepMs) {
      const sliceStart = new Date(t).toISOString();
      const sliceEnd = new Date(Math.min(t + stepMs, e0)).toISOString();

      let cnt = 0;
      for (const x of reservations) {
        if (x.reservation_id === resId) continue;
        if (!isActiveStatus(x.status)) continue;

        const w = getResWindow(x);
        if (overlaps(w.start, w.end, sliceStart, sliceEnd)) cnt += 1;
      }
      if (cnt > max) max = cnt;
    }

    return max;
  }

  function isWithinBusinessHours(candStart: string, candEnd: string) {
    const openIso = isoAtKst(dateStr, openHHmm);
    const closeIso = isoAtKst(dateStr, closeHHmm);
    const s = new Date(candStart).getTime();
    const e = new Date(candEnd).getTime();
    return s >= new Date(openIso).getTime() && e <= new Date(closeIso).getTime();
  }

  async function rescheduleReservation(resId: string, newStart: string) {
    const { data, error } = await supabase.rpc("admin_reschedule_reservation", {
      res_id: resId,
      new_start: newStart,
    });

    if (error) {
      console.error("admin_reschedule_reservation error:", error);
      const detail = [error.message, (error as any).details, (error as any).hint].filter(Boolean).join(" / ");
      throw new Error(detail || "시간 변경 실패");
    }
    if (!data) throw new Error("시간 변경 실패");
  }

  async function handleDropToSlot(slotStartIso: string) {
    const resId = dragResId;
    if (!resId) return;

    const r = reservations.find((x) => x.reservation_id === resId);
    if (!r) {
      setMsg("드래그한 예약을 찾지 못했습니다.");
      return;
    }

    if (isDayBased(r.duration_minutes)) {
      setMsg("멀티데이 예약은 이 화면에서 드래그 이동을 지원하지 않습니다.");
      return;
    }

    if (mustStartAtOpenFor(r) && !isOpenSlot(slotStartIso)) {
      setMsg(`영업일 작업(일 단위)은 ${openHHmm} 슬롯으로만 이동할 수 있습니다.`);
      return;
    }

    const candStart = slotStartIso;
    const candEnd = computeCandidateEnd(r, candStart);

    if (!isWithinBusinessHours(candStart, candEnd)) {
      setMsg(`영업시간(${openHHmm}~${closeHHmm}) 범위를 벗어납니다.`);
      return;
    }

    if (isBlockedByList(candStart, candEnd)) {
      setMsg("차단 시간과 겹쳐 이동할 수 없습니다.");
      return;
    }

    const cap = clampInt(Number(liftCap), 1, 20);
    const maxOther = maxOtherOverlapsInWindow(resId, candStart, candEnd);
    if (maxOther >= cap) {
      setMsg(`멀티드래그 실패: 리프트 용량(${cap}) 초과 (동시 겹침 ${maxOther}건)`);
      return;
    }

    try {
      setSaving(true);
      setMsg(null);
      await rescheduleReservation(resId, candStart);
      await refresh();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const activeAssignedLabel = useMemo(() => {
    if (!activeRes?.assigned_admin_id) return "-";
    return adminLabelById.get(activeRes.assigned_admin_id) ?? activeRes.assigned_admin_id;
  }, [activeRes?.assigned_admin_id, adminLabelById]);

  const activeCompletedLabel = useMemo(() => {
    if (!activeRes?.completed_admin_id) return "-";
    return adminLabelById.get(activeRes.completed_admin_id) ?? activeRes.completed_admin_id;
  }, [activeRes?.completed_admin_id, adminLabelById]);

  const stats = useMemo(() => {
    const total = visibleReservations.length;
    const done = visibleReservations.filter((r) => r.status === "completed").length;
    const pending = visibleReservations.filter((r) => r.status === "pending").length;
    const confirmed = visibleReservations.filter((r) => r.status === "confirmed").length;
    const blockedCount = blocked.length;
    return { total, done, pending, confirmed, blockedCount };
  }, [visibleReservations, blocked]);

  const openModal = (reservationId: string) => {
    setActiveResId(reservationId);
    replaceSearch((sp) => {
      sp.set("tab", "schedule");
      sp.set("date", dateStr);
      sp.set("focus", reservationId);
    });
  };

  const closeModal = () => {
    setActiveResId(null);
    replaceSearch((sp) => sp.delete("focus"));
  };

  return (
    <div style={styles.shell}>
      <div style={styles.bg} aria-hidden />
      <h2 style={styles.h1}>관리자 운영: 스케줄</h2>

      <div style={styles.glass}>
        <div style={styles.topbar}>
          <div style={styles.controlRow}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={styles.label}>날짜</div>
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} style={styles.input} />
            </div>

            <button
              onClick={refresh}
              disabled={loading}
              style={{ ...styles.btnPrimary, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "새로고침..." : "새로고침"}
            </button>

            <label style={{ display: "inline-flex", gap: 10, alignItems: "center", color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              내 배정만 보기
            </label>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={styles.label}>리프트(동시작업)</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={liftDraft}
                  onChange={(e) => setLiftDraft(clampInt(Number(e.target.value), 1, 20))}
                  style={{ ...styles.input, width: 120 }}
                  disabled={liftSaving}
                />
                <button
                  onClick={saveLiftCapacity}
                  disabled={liftSaving || clampInt(Number(liftDraft), 1, 20) === clampInt(Number(liftCap), 1, 20)}
                  style={{
                    ...styles.btnDark,
                    opacity: liftSaving || liftDraft === liftCap ? 0.6 : 1,
                    cursor: liftSaving || liftDraft === liftCap ? "not-allowed" : "pointer",
                  }}
                  title="ops_settings.max_batch_qty 에 저장"
                >
                  {liftSaving ? "저장중..." : "저장"}
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
            <span style={chipStyle("info")}>
              운영 {openHHmm}~{closeHHmm} · {safeSlotMinutes}분
            </span>
            <span style={chipStyle("info")}>TZ {tz || "Asia/Seoul"}</span>
            <span style={chipStyle("info")}>수용 {Math.max(1, capacity)}대</span>
            <span style={chipStyle("info")}>리프트 {Math.max(1, liftCap)}대</span>
            <span style={chipStyle("info")}>총 {stats.total}건</span>
            <span style={chipStyle("ok")}>완료 {stats.done}</span>
            <span style={chipStyle("warn")}>확정 {stats.confirmed}</span>
            <span style={chipStyle("info")}>대기 {stats.pending}</span>
            <span style={chipStyle("danger")}>차단 {stats.blockedCount}</span>
          </div>
        </div>

        <div style={styles.gridHead}>
          {openHHmm} ~ {closeHHmm} ({safeSlotMinutes}분 그리드) · 동시작업(리프트) {Math.max(1, liftCap)}건 · 팁: 예약 버튼을 드래그 → 다른 시간칸에 드롭
        </div>

        {slots.map((s) => {
          const label = new Date(s.startIso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
          const isBlocked = !!s.blocked;
          const hasRes = s.reservations.length > 0;
          const isDragOver = dragOverSlotStart === s.startIso && !!dragResId;

          const rowBg = isBlocked
            ? "linear-gradient(180deg, rgba(251,113,133,0.10), rgba(255,255,255,0.02))"
            : hasRes
            ? "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))"
            : "rgba(255,255,255,0.02)";

          const rowOutline = isDragOver ? "2px solid rgba(255,255,255,0.85)" : "1px solid transparent";

          const cap = Math.max(1, liftCap);
          const occ = s.reservations.filter((r) => isCapacityConsumer(r.status)).length;
          const capChipKind = occ >= cap ? "danger" : occ > 0 ? "warn" : "info";

          return (
            <div
              key={s.startIso}
              onDragOver={(e) => {
                if (!dragResId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = isBlocked ? "none" : "move";
                setDragOverSlotStart(s.startIso);
              }}
              onDragLeave={() => {
                if (dragOverSlotStart === s.startIso) setDragOverSlotStart(null);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOverSlotStart(null);
                if (isBlocked) {
                  setMsg("차단된 슬롯에는 드롭할 수 없습니다.");
                  return;
                }
                await handleDropToSlot(s.startIso);
                setDragResId(null);
              }}
              style={{
                ...styles.slotRow,
                background: rowBg,
                outline: rowOutline,
                outlineOffset: -2,
                opacity: saving ? 0.85 : 1,
              }}
            >
              <div style={styles.timePill}>{label}</div>

              <div style={{ display: "grid", gap: 8 }}>
                {isBlocked ? (
                  <div style={{ ...chipStyle("danger"), width: "fit-content" }}>
                    ⛔ 차단됨{s.blocked?.reason ? ` · ${s.blocked.reason}` : ""}
                  </div>
                ) : (
                  <div style={{ ...chipStyle(capChipKind as any), width: "fit-content" }}>
                    용량 {occ}/{cap}
                    {occ >= cap ? " · FULL" : ""}
                  </div>
                )}

                {hasRes ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {s.reservations.map((r) => {
                      const isActive = r.reservation_id === activeResId;
                      const draggableOk = !saving && !isDayBased(r.duration_minutes);

                      const assignedLabel = r.assigned_admin_id ? adminLabelById.get(r.assigned_admin_id) ?? r.assigned_admin_id : null;
                      const completedLabel = r.completed_admin_id ? adminLabelById.get(r.completed_admin_id) ?? r.completed_admin_id : null;

                      const assigned = assignedLabel ? `배정:${assignedLabel}` : "미배정";
                      const completed = completedLabel ? `완료:${completedLabel}` : "";

                      return (
                        <button
                          key={r.reservation_id}
                          onClick={() => openModal(r.reservation_id)}
                          draggable={draggableOk}
                          onDragStart={(e) => {
                            if (!draggableOk) return;
                            setDragResId(r.reservation_id);
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", r.reservation_id);
                          }}
                          onDragEnd={() => {
                            setDragResId(null);
                            setDragOverSlotStart(null);
                          }}
                          style={isActive ? styles.resBtnActive : styles.resBtn}
                          title={isDayBased(r.duration_minutes) ? "멀티데이 예약은 드래그 이동 불가" : "드래그해서 다른 시간칸으로 이동"}
                        >
                          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                            <b style={{ fontSize: 14, letterSpacing: "-0.3px" }}>{r.service_name}</b>
                            <span style={{ opacity: 0.9, fontSize: 12 }}>
                              {r.full_name ?? "-"} · {r.phone ?? "-"} · 상태: {STATUS_LABEL[r.status] ?? r.status}
                              {typeof r.quantity === "number" ? ` · 수량:${r.quantity}` : ""}
                            </span>
                          </div>

                          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                            {assigned}
                            {completed ? ` · ${completed}` : ""}
                          </div>

                          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={chipStyle(r.status === "completed" ? "ok" : r.status === "confirmed" ? "warn" : "info")}>
                              {STATUS_LABEL[r.status] ?? r.status}
                            </span>
                            {indicatingDraggableHint(r.duration_minutes, saving) ? (
                              <span style={chipStyle("danger")}>멀티데이 · 드래그 불가</span>
                            ) : (
                              <span style={chipStyle("info")}>드래그 이동</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : !isBlocked ? (
                  <div style={styles.empty}>비어있음</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {msg ? <div style={styles.msgBar}>{msg}</div> : null}

      {activeResId ? (
        <div
          className="asrBackdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="asrModal">
            <div className="asrHead">
              <div className="asrHeadTitle">예약 관리</div>
              <button className="asrBtn" onClick={closeModal}>
                닫기
              </button>
            </div>

            <div className="asrBody">
              {!activeRes ? (
                <div className="asrMeta">예약 정보를 불러오는 중…</div>
              ) : (
                <>
                  <div className="asrInfoCard">
                    <div className="asrTitle">
                      {activeRes.service_name} · {activeRes.full_name ?? "-"} ({activeRes.phone ?? "-"})
                    </div>
                    <div className="asrMeta">
                      차종: {activeRes.car_model ?? "-"} · 시간: {activeTimeInfo?.label ?? "-"}
                      {typeof activeRes.quantity === "number" ? ` · 수량:${activeRes.quantity}` : ""}
                    </div>
                    <div className="asrMeta">
                      시작(원본): {fmtKst(activeRes.scheduled_at)} · 상태: <b>{STATUS_LABEL[activeRes.status] ?? activeRes.status}</b>
                    </div>
                    <div className="asrMeta">
                      배정: <b>{activeAssignedLabel}</b> · 완료: <b>{activeCompletedLabel}</b>{" "}
                      {activeRes.completed_at ? `(${fmtKst(activeRes.completed_at)})` : ""}
                    </div>
                  </div>

                  <div className="asrActionsCard">
                    <div className="asrActionsRow">
                      <div className="asrField">
                        <div className="asrFieldLabel">상태</div>
                        <SelectField
                          ariaLabel="상태 변경"
                          value={draftStatus}
                          onChange={(v) => setDraftStatus(v as ReservationStatus)}
                          disabled={saving}
                          style={{ minWidth: 170 }}
                        >
                          {(["pending", "confirmed", "completed", "canceled", "no_show"] as ReservationStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </SelectField>
                      </div>

                      <button
                        className="asrBtnPrimary"
                        onClick={async () => {
                          try {
                            setSaving(true);
                            const ok = await adminSetReservationStatus(activeRes.reservation_id, draftStatus);
                            if (!ok) throw new Error("상태 변경 실패");
                            await refresh();
                          } catch (e: any) {
                            alert(e?.message ?? String(e));
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving || draftStatus === activeRes.status}
                      >
                        {saving ? "적용중..." : "상태 적용"}
                      </button>

                      <div className="asrField">
                        <div className="asrFieldLabel">담당자</div>
                        <SelectField
                          ariaLabel="담당자 선택"
                          value={assigneeDraft}
                          onChange={(v) => setAssigneeDraft(v)}
                          disabled={saving}
                          style={{ minWidth: 220 }}
                        >
                          <option value="">(미배정)</option>
                          {admins.map((a) => (
                            <option key={a.user_id} value={a.user_id}>
                              {a.label}
                            </option>
                          ))}
                        </SelectField>
                      </div>

                      <button
                        className="asrBtn"
                        onClick={async () => {
                          try {
                            if (!assigneeDraft) return alert("배정할 담당자를 선택하세요.");
                            setSaving(true);
                            const ok = await adminAssignReservation(activeRes.reservation_id, assigneeDraft);
                            if (!ok) throw new Error("배정 실패");
                            await refresh();
                          } catch (e: any) {
                            alert(e?.message ?? String(e));
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving}
                      >
                        담당자 배정
                      </button>

                      <button
                        className="asrBtn"
                        onClick={async () => {
                          try {
                            setSaving(true);
                            const ok = await adminUnassignReservation(activeRes.reservation_id);
                            if (!ok) throw new Error("배정 해제 실패");
                            setAssigneeDraft("");
                            await refresh();
                          } catch (e: any) {
                            alert(e?.message ?? String(e));
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving || !activeRes.assigned_admin_id}
                      >
                        배정 해제
                      </button>

                      <button
                        className="asrBtnSuccess"
                        onClick={async () => {
                          try {
                            setSaving(true);
                            const ok = await adminMarkReservationCompleted(activeRes.reservation_id);
                            if (!ok) throw new Error("완료 처리 실패");
                            await refresh();
                            setDraftStatus("completed");
                          } catch (e: any) {
                            alert(e?.message ?? String(e));
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving || activeRes.status === "completed"}
                        title="완료자(현재 관리자)로 기록됩니다"
                      >
                        {saving ? "처리중..." : "완료 처리(기록)"}
                      </button>

                      <button
                        className="asrBtnDanger"
                        onClick={async () => {
                          const ok1 = confirm("이 예약을 DB에서 완전히 삭제할까요? (되돌릴 수 없음)");
                          if (!ok1) return;

                          const ok2 = confirm("정말 삭제할까요? 삭제하면 기록이 사라집니다.");
                          if (!ok2) return;

                          try {
                            setSaving(true);
                            const ok = await adminDeleteReservation(activeRes.reservation_id);
                            if (!ok) throw new Error("삭제 실패");
                            await refresh();
                            closeModal();
                          } catch (e: any) {
                            alert(e?.message ?? String(e));
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving}
                      >
                        {saving ? "처리중..." : "예약 삭제"}
                      </button>
                    </div>

                    <div className="asrNote">
                      메모: “완료 처리(기록)”을 누르면 <b>completed_admin_id</b>에 현재 관리자 ID가 기록됩니다.
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
