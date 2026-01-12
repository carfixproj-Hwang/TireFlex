// src/lib/role.ts
import { supabase } from "./supabaseClient";

export type AppRole = "owner" | "staff" | "member";

export async function getMyRole(): Promise<AppRole> {
  const { data, error } = await supabase.rpc("get_my_role");
  if (error) throw new Error(error.message);
  const role = String(data ?? "member") as AppRole;
  if (role !== "owner" && role !== "staff" && role !== "member") return "member";
  return role;
}

export async function isStaff(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_staff", {});
  if (error) return false;
  return Boolean(data);
}

export async function isOwner(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_owner", {});
  if (error) return false;
  return Boolean(data);
}
