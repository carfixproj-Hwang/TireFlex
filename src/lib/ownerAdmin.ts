// src/lib/ownerAdmin.ts
import { supabase } from "./supabaseClient";

export type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: "owner" | "staff" | "member";
  created_at: string;
  updated_at: string;
};

export async function rpcIsOwner(uid: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_owner", { uid });
  if (error) return false;
  return Boolean(data);
}

export async function ownerListProfiles(params: { q?: string; lim?: number; off?: number }) {
  const { q = "", lim = 50, off = 0 } = params;
  const { data, error } = await supabase.rpc("owner_list_profiles", { q, lim, off });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProfileRow[];
}

export async function ownerSetProfileRole(targetUserId: string, newRole: ProfileRow["role"]) {
  const { data, error } = await supabase.rpc("owner_set_profile_role", {
    target_user_id: targetUserId,
    new_role: newRole,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}
