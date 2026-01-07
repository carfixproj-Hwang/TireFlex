import { supabase } from "./supabaseClient";

export async function adminCreateBlockedTimeWithShift(input: {
  start_at: string; // ISO
  end_at: string;   // ISO
  reason?: string | null;
}): Promise<{ blocked_id: string; shifted: number }> {
  const { data, error } = await supabase.rpc("admin_create_blocked_time_with_shift", {
    start_at: input.start_at,
    end_at: input.end_at,
    reason: input.reason ?? null,
  });
  if (error) throw new Error(error.message);

  return {
    blocked_id: data.blocked_id as string,
    shifted: Number(data.shifted ?? 0),
  };
}

export async function adminRestoreReservationsForBlock(blockId: string): Promise<{ restored: number; skipped: number }> {
  const { data, error } = await supabase.rpc("admin_restore_reservations_for_block", {
    block_id: blockId,
  });
  if (error) throw new Error(error.message);

  return {
    restored: Number(data.restored ?? 0),
    skipped: Number(data.skipped ?? 0),
  };
}
