import { supabase } from "./supabaseClient";
import type { ReservationRow } from "./booking";

export type BlockRow = {
  id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
  created_by: string;
  created_at: string;
};

export async function adminListReservationsByDay(dateStr: string) {
  // dateStr: YYYY-MM-DD (KST 기준 09:00~18:00만 보여줄거라 프론트에서 필터)
  const start = new Date(`${dateStr}T00:00:00+09:00`).toISOString();
  const end = new Date(`${dateStr}T23:59:59+09:00`).toISOString();

  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .gte("scheduled_at", start)
    .lt("scheduled_at", end)
    .order("scheduled_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ReservationRow[];
}

export async function adminListBlockedByDay(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00+09:00`).toISOString();
  const end = new Date(`${dateStr}T23:59:59+09:00`).toISOString();

  const { data, error } = await supabase
    .from("blocked_times")
    .select("*")
    .gte("start_at", start)
    .lt("end_at", end)
    .order("start_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as BlockRow[];
}

export async function adminBlockDay(dateStr: string, reason?: string | null) {
  const { data, error } = await supabase.rpc("block_day", { slot_date: dateStr, reason: reason ?? null });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function adminBlockRange(startAtIso: string, endAtIso: string, reason?: string | null) {
  const { data, error } = await supabase.rpc("block_range", {
    start_at: startAtIso,
    end_at: endAtIso,
    reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
