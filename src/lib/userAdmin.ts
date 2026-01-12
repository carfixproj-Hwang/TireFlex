// src/lib/userAdmin.ts
import { supabase } from "./supabaseClient";
import type { AppRole } from "./role";

export type MemberRow = {
  user_id: string;
  role: string;
  full_name: string | null;
  phone: string | null;
  car_model: string | null;
  created_at: string;
};

export async function staffListMembers(q: string): Promise<MemberRow[]> {
  const { data, error } = await supabase.rpc("staff_list_members", { q: q?.trim() ? q.trim() : null });
  if (error) throw new Error(error.message);
  return (data ?? []) as MemberRow[];
}

export async function ownerListStaff(q: string): Promise<MemberRow[]> {
  const { data, error } = await supabase.rpc("owner_list_staff", { q: q?.trim() ? q.trim() : null });
  if (error) throw new Error(error.message);
  return (data ?? []) as MemberRow[];
}

export async function ownerSetUserRole(targetUserId: string, role: AppRole): Promise<boolean> {
  const { data, error } = await supabase.rpc("owner_set_user_role", {
    target_user_id: targetUserId,
    new_role: role,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}
