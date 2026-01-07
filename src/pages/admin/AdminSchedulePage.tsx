// src/pages/admin/AdminSchedulePage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
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

function computeDayBasedWindow(scheduledAtIso: string, durationMinutes: number) {
  const base = kstDateStringFromIso(scheduledAtIso);
  const days = durationMinutes / 1440;

  const start = isoAtKst(base, "09:00");

  const endDate = new Date(`${base}T00:00:00+09:00`);
  endDate.setDate(endDate.getDate() + days);
  const endY = endDate.getFullYear();
  const endM = String(endDate.getMonth() + 1).padStart(2, "0");
  const endD = String(endDate.getDate()).padStart(2, "0");
  const end = isoAtKst(`${endY}-${endM}-${endD}`, "18:00");

  return { start, end, base, days };
}

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "대기",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소",
  no_show: "노쇼",
};

const WORKDAY_MINUTES = 540;

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
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={select}
      >
        {children}
      </select>
      <span style={arrow} aria-hidden>
        ▾
      </span>
    </div>
  );
}

export default function AdminSchedulePage() {
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

    const btn: CSSProperties = {
      padding: "11px 14px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.92)",
      fontWeight: 900,
      cursor: "pointer",
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

    const btnDanger: CSSProperties = {
      padding: "11px 14px",
      borderRadius: 14,
      border: "1px solid rgba(251,113,133,0.35)",
      background: "rgba(251,113,133,0.14)",
      color: "rgba(255,255,255,0.92)",
      fontWeight: 950,
      cursor: "pointer",
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

    const panel: CSSProperties = {
      marginTop: 12,
      borderRadius: 18,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.05)",
      backdropFilter: "blur(10px)",
      boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
      overflow: "hidden",
    };

    const panelHead: CSSProperties = {
      padding: 12,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
      borderBottom: "1px solid rgba(255,255,255,0.10)",
      color: "rgba(255,255,255,0.92)",
      fontWeight: 950,
    };

    const panelBody: CSSProperties = { padding: 12, display: "grid", gap: 12 };

    const mono: CSSProperties = { fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.90)" };

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
      btn,
      btnPrimary,
      btnDanger,
      gridHead,
      slotRow,
      timePill,
      empty,
      resBtn,
      resBtnActive,
      panel,
      panelHead,
      panelBody,
      mono,
      msgBar,
    };
  }, []);

  const [dateStr, setDateStr] = useState(() => {
    const q = new URLSearchParams(window.location.search).get("date");
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : toDateInputValue(new Date());
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [reservations, setReservations] = useState<AdminReservationRow[]>([]);
  const [blocked, setBlocked] = useState<AdminBlockedTime[]>([]);

  const [activeResId, setActiveResId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<ReservationStatus>("pending");
  const [saving, setSaving] = useState(false);

  // ✅ 배정/필터
  const [admins, setAdmins] = useState<AdminUserOption[]>([]);
  const [myAdminId, setMyAdminId] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [assigneeDraft, setAssigneeDraft] = useState<string>("");

  // ✅ Drag & Drop 상태
  const [dragResId, setDragResId] = useState<string | null>(null);
  const [dragOverSlotStart, setDragOverSlotStart] = useState<string | null>(null);

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
    setActiveResId(null);
  }, [dateStr]);

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

  const slots = useMemo(() => {
    const rows: SlotRow[] = [];
    for (let i = 0; i < 18; i++) {
      const hh = 9 + Math.floor(i / 2);
      const mm = i % 2 === 0 ? "00" : "30";
      const startIso = isoAtKst(dateStr, `${String(hh).padStart(2, "0")}:${mm}`);
      const endIso = addMinutesIso(startIso, 30);

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
  }, [dateStr, visibleReservations, blocked]);

  async function refresh() {
    setLoading(true);
    setMsg(null);
    try {
      const [r, b] = await Promise.all([adminListReservationsByDate(dateStr), adminListBlockedTimesByDate(dateStr)]);
      setReservations(r);
      setBlocked(b);

      if (activeResId && !r.some((x) => x.reservation_id === activeResId)) {
        setActiveResId(null);
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

  const activeTimeInfo = useMemo(() => {
    if (!activeRes) return null;

    if (isDayBased(activeRes.duration_minutes)) {
      const w = computeDayBasedWindow(activeRes.scheduled_at, activeRes.duration_minutes);
      return {
        start: w.start,
        end: w.end,
        label: `${w.base} 09:00 ~ ${kstDateStringFromIso(w.end)} 18:00 (${w.days}일)`,
      };
    }

    const end = addMinutesIso(activeRes.scheduled_at, activeRes.duration_minutes);
    return {
      start: activeRes.scheduled_at,
      end,
      label: `${fmtTimeKst(activeRes.scheduled_at)} ~ ${fmtTimeKst(end)} (${activeRes.duration_minutes}분)`,
    };
  }, [activeRes]);

  function mustStartAt0900For(r: AdminReservationRow) {
    return r.duration_minutes === WORKDAY_MINUTES;
  }

  function is0900Slot(startIso: string) {
    return startIso.includes("T09:00:00+09:00");
  }

  function computeCandidateEnd(r: AdminReservationRow, candStart: string) {
    return addMinutesIso(candStart, r.duration_minutes);
  }

  function isBlockedByList(candStart: string, candEnd: string) {
    return blocked.some((bt) => overlaps(bt.start_at, bt.end_at, candStart, candEnd));
  }

  function isOverlappingOtherReservations(resId: string, candStart: string, candEnd: string) {
    return reservations.some((x) => {
      if (x.reservation_id === resId) return false;
      const xStart = x.scheduled_at;
      const xEnd = addMinutesIso(x.scheduled_at, x.duration_minutes);
      return overlaps(xStart, xEnd, candStart, candEnd);
    });
  }

  function isWithinBusinessHours(candStart: string, candEnd: string) {
    const open = isoAtKst(dateStr, "09:00");
    const close = isoAtKst(dateStr, "18:00");
    const s = new Date(candStart).getTime();
    const e = new Date(candEnd).getTime();
    return s >= new Date(open).getTime() && e <= new Date(close).getTime();
  }

  async function rescheduleReservation(resId: string, newStart: string) {
    const { data, error } = await supabase.rpc("admin_reschedule_reservation", {
      res_id: resId,
      new_start: newStart,
    });
    if (error) {
      console.error("admin_reschedule_reservation error:", error);
      throw new Error(error.message);
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

    if (mustStartAt0900For(r) && !is0900Slot(slotStartIso)) {
      setMsg("영업일 작업(일 단위)은 09:00 슬롯으로만 이동할 수 있습니다.");
      return;
    }

    const candStart = slotStartIso;
    const candEnd = computeCandidateEnd(r, candStart);

    if (!isWithinBusinessHours(candStart, candEnd)) {
      setMsg("영업시간(09:00~18:00) 범위를 벗어납니다.");
      return;
    }

    if (isBlockedByList(candStart, candEnd)) {
      setMsg("차단 시간과 겹쳐 이동할 수 없습니다.");
      return;
    }

    if (isOverlappingOtherReservations(resId, candStart, candEnd)) {
      setMsg("다른 예약과 시간이 겹칩니다.");
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

  return (
    <div style={styles.shell}>
      <div style={styles.bg} aria-hidden />
      <h2 style={styles.h1}>관리자 운영: 스케줄</h2>

      <div style={styles.glass}>
        <div style={styles.topbar}>
          <div style={styles.controlRow}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={styles.label}>날짜</div>
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                style={styles.input}
              />
            </div>

            <button onClick={refresh} disabled={loading} style={{ ...styles.btnPrimary, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "새로고침..." : "새로고침"}
            </button>

            <label style={{ display: "inline-flex", gap: 10, alignItems: "center", color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              내 배정만 보기
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
            <span style={chipStyle("info")}>총 {stats.total}건</span>
            <span style={chipStyle("ok")}>완료 {stats.done}</span>
            <span style={chipStyle("warn")}>확정 {stats.confirmed}</span>
            <span style={chipStyle("info")}>대기 {stats.pending}</span>
            <span style={chipStyle("danger")}>차단 {stats.blockedCount}</span>
          </div>
        </div>

        <div style={styles.gridHead}>09:00 ~ 18:00 (30분 그리드) · 팁: 예약 버튼을 드래그 → 다른 시간칸에 드롭</div>

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
                ) : null}

                {hasRes ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {s.reservations.map((r) => {
                      const isActive = r.reservation_id === activeResId;
                      const draggableOk = !saving && !isDayBased(r.duration_minutes);

                      const assignedLabel = r.assigned_admin_id
                        ? adminLabelById.get(r.assigned_admin_id) ?? r.assigned_admin_id
                        : null;
                      const completedLabel = r.completed_admin_id
                        ? adminLabelById.get(r.completed_admin_id) ?? r.completed_admin_id
                        : null;

                      const assigned = assignedLabel ? `배정:${assignedLabel}` : "미배정";
                      const completed = completedLabel ? `완료:${completedLabel}` : "";

                      return (
                        <button
                          key={r.reservation_id}
                          onClick={() => setActiveResId(r.reservation_id)}
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

      {activeRes ? (
        <div style={styles.panel}>
          <div style={styles.panelHead}>
            <div>예약 관리</div>
            <button
              onClick={() => setActiveResId(null)}
              style={{ ...styles.btn, background: "rgba(255,255,255,0.06)" }}
            >
              닫기
            </button>
          </div>

          <div style={styles.panelBody}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 950, fontSize: 16, color: "rgba(255,255,255,0.94)", letterSpacing: "-0.4px" }}>
                {activeRes.service_name} · {activeRes.full_name ?? "-"} ({activeRes.phone ?? "-"})
              </div>
              <div style={styles.mono}>
                차종: {activeRes.car_model ?? "-"} · 시간: {activeTimeInfo?.label ?? "-"}
                {typeof activeRes.quantity === "number" ? ` · 수량:${activeRes.quantity}` : ""}
              </div>
              <div style={styles.mono}>
                시작(원본): {fmtKst(activeRes.scheduled_at)} · 상태: <b>{STATUS_LABEL[activeRes.status] ?? activeRes.status}</b>
              </div>
              <div style={styles.mono}>
                배정: <b>{activeAssignedLabel}</b> · 완료: <b>{activeCompletedLabel}</b>{" "}
                {activeRes.completed_at ? `(${fmtKst(activeRes.completed_at)})` : ""}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {/* ✅ 상태 */}
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.90)" }}>상태</div>
                <SelectField
                  ariaLabel="상태 변경"
                  value={draftStatus}
                  onChange={(v) => setDraftStatus(v as ReservationStatus)}
                  disabled={saving}
                >
                  {(["pending", "confirmed", "completed", "canceled", "no_show"] as ReservationStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </SelectField>
              </div>

              <button
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
                style={{
                  ...styles.btnPrimary,
                  opacity: saving || draftStatus === activeRes.status ? 0.6 : 1,
                  cursor: saving || draftStatus === activeRes.status ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "적용중..." : "상태 적용"}
              </button>

              {/* ✅ 담당자 */}
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.90)" }}>담당자</div>
                <SelectField
                  ariaLabel="담당자 선택"
                  value={assigneeDraft}
                  onChange={(v) => setAssigneeDraft(v)}
                  disabled={saving}
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
                style={{ ...styles.btn, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
              >
                담당자 배정
              </button>

              <button
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
                style={{
                  ...styles.btn,
                  opacity: saving || !activeRes.assigned_admin_id ? 0.55 : 1,
                  cursor: saving || !activeRes.assigned_admin_id ? "not-allowed" : "pointer",
                }}
              >
                배정 해제
              </button>

              {/* ✅ 완료 */}
              <button
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
                style={{
                  ...styles.btn,
                  border: "1px solid rgba(110,231,183,0.28)",
                  background: "rgba(110,231,183,0.10)",
                  opacity: saving || activeRes.status === "completed" ? 0.55 : 1,
                  cursor: saving || activeRes.status === "completed" ? "not-allowed" : "pointer",
                  fontWeight: 950,
                }}
                title="완료자(현재 관리자)로 기록됩니다"
              >
                {saving ? "처리중..." : "완료 처리(기록)"}
              </button>

              {/* ✅ 삭제 */}
              <button
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
                    setActiveResId(null);
                  } catch (e: any) {
                    alert(e?.message ?? String(e));
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                style={{ ...styles.btnDanger, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
              >
                {saving ? "처리중..." : "예약 삭제"}
              </button>
            </div>

            <div style={{ fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.90)" }}>
              메모: “완료 처리(기록)”을 누르면 <b>completed_admin_id</b>에 현재 관리자 ID가 기록됩니다.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
