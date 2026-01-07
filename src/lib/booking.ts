// src/lib/booking.ts
import { supabase } from "./supabaseClient";

export type ReservationStatus = "pending" | "confirmed" | "completed" | "canceled" | "no_show";

export type ReservationRow = {
  id: string;
  user_id: string;
  service_item_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  problem: string | null;
  insurance: boolean;
  status: ReservationStatus;
  user_note: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at?: string;
  root_reservation_id?: string;
  segment_no?: number | null;

  quantity?: number;
  assigned_admin_id?: string | null;
  completed_admin_id?: string | null;
  completed_at?: string | null;
};

export type ServiceItemDurationUnit = "minutes" | "workdays";

export type ServiceItem = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  duration_unit?: ServiceItemDurationUnit | null;
  duration_value?: number | null;
  active: boolean;
  created_at: string;
  updated_at?: string;
};

export type BusinessSettings = {
  id: number;
  week_mode: string;
  open_time: string;
  close_time: string;
  slot_minutes: number;
  tz: string;
  capacity: number;
  max_batch_qty: number;

  open_dow?: boolean[];
  updated_at?: string;
};

function normalizeIsoLike(s: string): string {
  let x = (s ?? "").trim();
  if (!x) return x;

  // "2026-01-05 04:46:04.969548+00" -> "2026-01-05T04:46:04.969548+00"
  if (x.includes(" ") && !x.includes("T")) {
    const idx = x.indexOf(" ");
    x = x.slice(0, idx) + "T" + x.slice(idx + 1);
  }

  // +09 -> +09:00, +0900 -> +09:00
  x = x.replace(/([+-]\d{2})$/, "$1:00");
  x = x.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");

  return x;
}

function isRpcNotFound(err: any): boolean {
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  const msg = String(err?.message ?? "").toLowerCase();
  return status === 404 || msg.includes("not found");
}

export async function getBusinessSettings(): Promise<BusinessSettings> {
  // ✅ 1순위: ops_settings(id=1)
  {
    const { data, error } = await supabase.from("ops_settings").select("*").eq("id", 1).maybeSingle();
    if (!error && data) return data as BusinessSettings;
  }

  // ✅ 하위호환: business_settings(id=1)
  {
    const { data, error } = await supabase.from("business_settings").select("*").eq("id", 1).maybeSingle();
    if (!error && data) return data as BusinessSettings;
  }

  throw new Error("운영 설정(ops_settings / business_settings)을 찾지 못했습니다. (id=1 확인 필요)");
}

export async function getIsAdmin(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return false;

  const { data, error } = await supabase.rpc("is_admin", { uid });
  if (error) return false;
  return Boolean(data);
}

export async function listActiveServiceItems(): Promise<ServiceItem[]> {
  const { data, error } = await supabase.from("service_items").select("*").eq("active", true).order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceItem[];
}

export async function listAllServiceItemsAdmin(): Promise<ServiceItem[]> {
  const { data, error } = await supabase.from("service_items").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceItem[];
}

export async function createServiceItemAdmin(input: {
  name: string;
  description?: string | null;
  duration_minutes: number;
  duration_unit?: ServiceItemDurationUnit | null;
  duration_value?: number | null;
  active?: boolean;
}): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not authenticated");

  const payload: any = {
    name: input.name,
    description: input.description ?? null,
    duration_minutes: input.duration_minutes,
    active: input.active ?? true,
    created_by: uid,
  };

  if (typeof input.duration_unit !== "undefined") payload.duration_unit = input.duration_unit ?? "minutes";
  if (typeof input.duration_value !== "undefined") payload.duration_value = input.duration_value ?? null;

  const { data, error } = await supabase.from("service_items").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateServiceItemAdmin(
  id: string,
  patch: Partial<Pick<ServiceItem, "name" | "description" | "duration_minutes" | "active" | "duration_unit" | "duration_value">>
) {
  const { error } = await supabase.from("service_items").update(patch as any).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * ✅ 슬롯 조회
 * - 현재 DB: get_available_slots(date, uuid, quantity integer default 1)
 * - 혹시 과거 환경(req_qty 이름) 대응: 404일 때만 req_qty로 재시도
 */
export async function getAvailableSlots(dateStr: string, serviceItemId: string, reqQty: number = 1): Promise<string[]> {
  const safeQty = Math.max(1, Math.floor(Number(reqQty) || 1));

  // ✅ 1) 표준: quantity
  let { data, error } = await supabase.rpc("get_available_slots", {
    slot_date: dateStr,
    service_item_id: serviceItemId,
    quantity: safeQty,
  });

  // ✅ 2) (구버전) req_qty 이름만 쓰는 환경이면 404로 떨어질 수 있어서 fallback
  if (error && isRpcNotFound(error)) {
    const fb = await supabase.rpc("get_available_slots", {
      slot_date: dateStr,
      service_item_id: serviceItemId,
      req_qty: safeQty,
    } as any);
    data = fb.data;
    error = fb.error;
  }

  if (error) throw new Error(error.message);

  const raw = (data ?? []) as any[];
  const slots = raw
    .map((x) => (x?.slot_start ?? x?.start_at ?? x?.slotStart ?? x?.startAt) as string | undefined)
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => normalizeIsoLike(v));

  return Array.from(new Set(slots));
}

export async function createReservation(input: {
  slot_start: string;
  service_item_id: string;
  problem: string;
  insurance: boolean;
  user_note?: string | null;
  quantity?: number;
}): Promise<string> {
  const payload: any = {
    slot_start: input.slot_start,
    service_item_id: input.service_item_id,
    problem: input.problem,
    insurance: input.insurance as any,
    user_note: input.user_note ?? null,
    quantity: input.quantity ?? 1,
  };

  const { data, error } = await supabase.rpc("create_reservation", payload);
  if (error) throw new Error(error.message);
  return data as string;
}

export async function cancelMyReservation(resId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("cancel_my_reservation", { res_id: resId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function listMyReservations(fromIso: string, toIso: string): Promise<ReservationRow[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .gte("scheduled_at", fromIso)
    .lt("scheduled_at", toIso)
    .order("scheduled_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ReservationRow[];
}
