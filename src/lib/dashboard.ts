// src/lib/dashboard.ts
import { supabase } from "./supabaseClient";

export type RecentCompletedRow = {
  service_name: string;
  completed_at: string;
};

export type MyCompletedRow = {
  reservation_id: string;
  service_name: string;
  scheduled_at: string;
  completed_at: string | null;
  duration_minutes: number;
  quantity: number;
};

export async function listRecentCompletedServices(limitN = 10): Promise<RecentCompletedRow[]> {
  const { data, error } = await supabase.rpc("list_recent_completed_services", { limit_n: limitN });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecentCompletedRow[];
}

export async function listMyCompletedServices(limitN = 50): Promise<MyCompletedRow[]> {
  const { data, error } = await supabase.rpc("list_my_completed_services", { limit_n: limitN });
  if (error) throw new Error(error.message);
  return (data ?? []) as MyCompletedRow[];
}
