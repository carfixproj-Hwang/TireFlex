// src/lib/adminReservations.ts
import { supabase } from "./supabaseClient";

export type ReservationStatus = "pending" | "confirmed" | "completed" | "canceled" | "no_show";

export type AdminReservationRow = {
  reservation_id: string;

  // ✅ 장기수리(분할 예약) 묶음 키
  root_reservation_id?: string | null;

  scheduled_at: string;
  duration_minutes: number;
  status: ReservationStatus;

  service_name: string;

  user_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  car_model?: string | null;

  quantity?: number | null;

  assigned_admin_id?: string | null;
  assigned_admin_label?: string | null;

  completed_admin_id?: string | null;
  completed_admin_label?: string | null;
  completed_at?: string | null;

  created_at?: string | null;
};

export type AdminUserOption = { user_id: string; label: string };

export async function adminListAdmins(): Promise<AdminUserOption[]> {
  const { data, error } = await supabase.rpc("admin_list_admins");
  if (error) throw error;
  return (data ?? []) as AdminUserOption[];
}

export async function adminAssignReservation(resId: string, assigneeId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_assign_reservation", {
    res_id: resId,
    assignee_id: assigneeId,
  });
  if (error) throw error;
  return typeof data === "boolean" ? data : true;
}

export async function adminUnassignReservation(resId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_unassign_reservation", { res_id: resId });
  if (error) throw error;
  return typeof data === "boolean" ? data : true;
}

export async function adminMarkReservationCompleted(resId: string): Promise<boolean> {
  const r1 = await supabase.rpc("admin_mark_reservation_completed", { res_id: resId });
  if (!r1.error) return typeof r1.data === "boolean" ? r1.data : true;

  // 하위호환
  const r2 = await supabase.rpc("admin_set_reservation_status", { res_id: resId, new_status: "completed" });
  if (r2.error) throw r2.error;
  return typeof r2.data === "boolean" ? r2.data : true;
}

export async function adminListReservationsByDate(dateStr: string): Promise<AdminReservationRow[]> {
  // ✅ v2 우선 (배정/완료/수량 포함)
  const v2 = await supabase.rpc("admin_list_reservations_by_date_v2", { slot_date: dateStr });
  if (!v2.error) return (v2.data ?? []) as AdminReservationRow[];

  // ✅ fallback (구버전)
  const { data, error } = await supabase.rpc("admin_list_reservations_by_date", { slot_date: dateStr });
  if (error) throw error;
  return (data ?? []) as AdminReservationRow[];
}

// ✅ 기간 조회 (오너 전체 정비내역 등)
export async function adminListReservationsByRange(startDate: string, endDate: string): Promise<AdminReservationRow[]> {
  // ✅ v2 우선
  const v2 = await supabase.rpc("admin_list_reservations_by_range_v2", { start_date: startDate, end_date: endDate });
  if (!v2.error) return (v2.data ?? []) as AdminReservationRow[];

  // ✅ fallback
  const { data, error } = await supabase.rpc("admin_list_reservations_by_range", { start_date: startDate, end_date: endDate });
  if (error) throw error;
  return (data ?? []) as AdminReservationRow[];
}

export async function adminSetReservationStatus(resId: string, newStatus: ReservationStatus): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_set_reservation_status", {
    res_id: resId,
    new_status: newStatus,
  });
  if (error) throw error;
  return typeof data === "boolean" ? data : true;
}

export async function adminDeleteReservation(resId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_delete_reservation", { res_id: resId });
  if (error) throw error;
  return typeof data === "boolean" ? data : true;
}
