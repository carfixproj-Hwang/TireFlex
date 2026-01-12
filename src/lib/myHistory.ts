// src/lib/myHistory.ts
import { supabase } from "./supabaseClient";

export type MyServiceHistoryRow = {
  reservation_id: string;
  scheduled_at: string;
  completed_at: string | null;
  status: string;
  duration_minutes: number;
  quantity: number;
  service_item_id: string;
  service_name: string;
  problem: string | null;
  insurance: boolean;
  user_note: string | null;
  admin_note: string | null;
};

export async function myListServiceHistory(params?: {
  limit?: number;
  onlyCompleted?: boolean;
}): Promise<MyServiceHistoryRow[]> {
  const limit_n = Math.max(1, Math.min(200, Math.floor(Number(params?.limit ?? 50) || 50)));
  const only_completed = params?.onlyCompleted ?? true;

  const { data, error } = await supabase.rpc("my_list_service_history", { limit_n, only_completed });
  if (error) throw new Error(error.message);

  return (data ?? []).map((x: any) => ({
    reservation_id: String(x.reservation_id),
    scheduled_at: String(x.scheduled_at),
    completed_at: x.completed_at ? String(x.completed_at) : null,
    status: String(x.status),
    duration_minutes: Number(x.duration_minutes),
    quantity: Number(x.quantity ?? 1),
    service_item_id: String(x.service_item_id),
    service_name: String(x.service_name),
    problem: x.problem ?? null,
    insurance: Boolean(x.insurance),
    user_note: x.user_note ?? null,
    admin_note: x.admin_note ?? null,
  }));
}
