// src/lib/adminCalendar.ts
import { supabase } from "./supabaseClient";
import { adminListReservationsByDate, adminListBlockedTimesByDate } from "./adminSchedule";

function addMinutesIso(iso: string, mins: number) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

export type CalendarEvent = {
  id: string;
  title?: string;
  start: string;
  end: string;
  editable?: boolean;
  display?: "auto" | "block" | "list-item" | "background" | "inverse-background" | "none";
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps?: Record<string, any>;
};

export async function adminMoveReservation(resId: string, newStartIso: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_move_reservation", {
    res_id: resId,
    new_start: newStartIso,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function adminLoadCalendarEventsByMonth(year: number, month1to12: number): Promise<CalendarEvent[]> {
  const start = new Date(year, month1to12 - 1, 1);
  const end = new Date(year, month1to12, 0);

  const days: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }

  const results = await Promise.all(
    days.map(async (ds) => {
      const [rs, bs] = await Promise.all([adminListReservationsByDate(ds), adminListBlockedTimesByDate(ds)]);
      return { ds, rs, bs };
    })
  );

  // ✅ 예약: "겹치는 예약 포함"이라 같은 예약이 여러 날짜에서 나오므로 중복 제거
  const resUniq = new Map<string, CalendarEvent>();
  // ✅ 차단: id 기준으로 중복 제거
  const blkUniq = new Map<string, CalendarEvent>();

  for (const x of results) {
    for (const r of x.rs) {
      if (!resUniq.has(r.reservation_id)) {
        resUniq.set(r.reservation_id, {
          id: r.reservation_id,
          title: `${r.service_name} · ${r.full_name ?? "-"}`,
          start: r.scheduled_at,
          end: addMinutesIso(r.scheduled_at, r.duration_minutes),
          editable: true,
          extendedProps: { kind: "reservation", status: r.status },
        });
      }
    }

    for (const b of x.bs) {
      const id = `block:${b.id}`;
      if (!blkUniq.has(id)) {
        blkUniq.set(id, {
          id,
          start: b.start_at,
          end: b.end_at,
          display: "background",
          // ✅ 핑크/레드 계열 배경
          backgroundColor: "#ffe4e6", // rose-100
          borderColor: "#fecaca", // rose-200
          extendedProps: { kind: "block", reason: b.reason ?? "" },
        });
      }
    }
  }

  return [...blkUniq.values(), ...resUniq.values()];
}
