// src/lib/publicFeed.ts
import { supabase } from "./supabaseClient";

export type PublicCompletedItem = {
  completed_at: string; // timestamptz
  service_name: string;
};

export async function publicListRecentCompleted(limit = 8): Promise<PublicCompletedItem[]> {
  const limit_n = Math.max(1, Math.min(50, Math.floor(Number(limit) || 8)));

  const { data, error } = await supabase.rpc("public_list_recent_completed", { limit_n });
  if (error) throw new Error(error.message);

  return (data ?? []).map((x: any) => ({
    completed_at: String(x.completed_at),
    service_name: String(x.service_name),
  }));
}

export async function publicCompletedCount(days = 7): Promise<number> {
  const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 7)));

  const { data, error } = await supabase.rpc("public_completed_count", { days: safeDays });
  if (error) throw new Error(error.message);

  return Number(data ?? 0);
}
