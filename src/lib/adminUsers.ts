// src/lib/adminUsers.ts
import { supabase } from "./supabaseClient";

export type AppRole = "owner" | "staff" | "member";

export type AdminUserRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  car_model: string | null;
  role: AppRole;
  created_at: string | null;
};

export async function getMyRole(): Promise<AppRole> {
  const { data, error } = await supabase.rpc("get_my_role", {});
  if (error) return "member";
  const r = String(data ?? "member");
  if (r === "owner" || r === "staff" || r === "member") return r;
  return "member";
}

export async function adminListUsers(params?: { q?: string; limit?: number }) {
  const { data, error } = await supabase.rpc("admin_list_users", {
    search_q: params?.q ?? null,
    limit_n: params?.limit ?? 200,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUserRow[];
}

export async function ownerSetUserRole(targetUserId: string, newRole: AppRole) {
  const { data, error } = await supabase.rpc("owner_set_user_role", {
    target_user_id: targetUserId,
    new_role: newRole,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}
