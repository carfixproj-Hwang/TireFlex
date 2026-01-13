// src/lib/ownerEstimates.ts
import { supabase } from "./supabaseClient";

export type EstimateItem = { name: string; qty: number; unitPrice: number };

export type ServiceEstimateRow = {
  id: string;
  reservation_id: string | null;
  issued_at: string;
  updated_at: string;
  created_by: string | null;

  snapshot: any; // jsonb
  items: EstimateItem[]; // jsonb
  memo: string | null;
  total_amount: number;
};

function normalizeItems(items: EstimateItem[]): EstimateItem[] {
  return (items ?? []).map((it) => ({
    name: String(it?.name ?? "").trim(),
    qty: Number.isFinite(Number(it?.qty)) ? Number(it.qty) : 0,
    unitPrice: Number.isFinite(Number(it?.unitPrice)) ? Number(it.unitPrice) : 0,
  }));
}

function kstStartIso(ymd: string) {
  // YYYY-MM-DD 기준 KST 00:00:00
  return new Date(`${ymd}T00:00:00+09:00`).toISOString();
}
function kstNextDayStartIso(ymd: string) {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export async function ownerUpsertServiceEstimate(input: {
  id?: string | null;
  reservationId?: string | null;
  snapshot: any;
  items: EstimateItem[];
  memo?: string | null;
  totalAmount: number;
}): Promise<ServiceEstimateRow> {
  const payload: any = {
    reservation_id: input.reservationId ?? null,
    snapshot: input.snapshot ?? {},
    items: normalizeItems(input.items),
    memo: (input.memo ?? "").trim() ? input.memo : null,
    total_amount: Math.max(0, Math.floor(Number(input.totalAmount) || 0)),
  };

  if (input.id) payload.id = input.id;

  const { data, error } = await supabase
    .from("service_estimates")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw error;
  return data as ServiceEstimateRow;
}

export async function ownerListServiceEstimatesByReservation(resId: string): Promise<ServiceEstimateRow[]> {
  const { data, error } = await supabase
    .from("service_estimates")
    .select("*")
    .eq("reservation_id", resId)
    .order("issued_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ServiceEstimateRow[];
}

export async function ownerListServiceEstimatesByIssuedRange(startYmd: string, endYmd: string): Promise<ServiceEstimateRow[]> {
  const startIso = kstStartIso(startYmd);
  const endIso = kstNextDayStartIso(endYmd); // end는 포함, 다음날 00:00 미만

  const { data, error } = await supabase
    .from("service_estimates")
    .select("*")
    .gte("issued_at", startIso)
    .lt("issued_at", endIso)
    .order("issued_at", { ascending: false })
    .limit(2000);

  if (error) throw error;
  return (data ?? []) as ServiceEstimateRow[];
}

export async function ownerDeleteServiceEstimate(id: string): Promise<boolean> {
  const { error } = await supabase.from("service_estimates").delete().eq("id", id);
  if (error) throw error;
  return true;
}
