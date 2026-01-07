// src/lib/adminSchedule.ts
import { supabase } from "./supabaseClient";

export type AdminReservationItem = {
  reservation_id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  car_model: string | null;
  service_item_id: string;
  service_name: string;
  scheduled_at: string; // timestamptz iso
  duration_minutes: number;
  status: string;

  // ✅ 추가 컬럼(있으면 내려옴)
  quantity?: number;
  assigned_admin_id?: string | null;
  assigned_admin_label?: string | null;
  completed_admin_id?: string | null;
  completed_admin_label?: string | null;
  completed_at?: string | null;
};

export type AdminBlockedTime = {
  id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
  created_by: string | null;
};

export async function adminListReservationsByDate(dateStr: string) {
  const { data, error } = await supabase.rpc("admin_list_reservations_by_date", {
    slot_date: dateStr,
  });
  if (error) throw error;
  return (data ?? []) as AdminReservationItem[];
}

export async function adminListBlockedTimesByDate(dateStr: string) {
  const { data, error } = await supabase.rpc("admin_list_blocked_times_by_date", {
    slot_date: dateStr,
  });
  if (error) throw error;
  return (data ?? []) as AdminBlockedTime[];
}

export async function adminCreateBlockedTime(startAtIso: string, endAtIso: string, reason?: string | null) {
  const { data, error } = await supabase.rpc("admin_create_blocked_time", {
    start_at: startAtIso,
    end_at: endAtIso,
    reason: reason ?? null,
  });
  if (error) throw error;
  return data as string; // uuid
}

export async function adminDeleteBlockedTime(blockId: string) {
  const { data, error } = await supabase.rpc("admin_delete_blocked_time", { block_id: blockId });
  if (error) throw error;
  return Boolean(data);
}
