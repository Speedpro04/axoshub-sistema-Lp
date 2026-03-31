import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function buildBaseUrl() {
  const explicit = process.env.PAGBANK_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const env = (process.env.PAGBANK_ENV || "sandbox").toLowerCase();
  return env === "production" ? "https://api.pagseguro.com" : "https://sandbox.api.pagseguro.com";
}

function mapStatus(status?: string | null) {
  const normalized = (status ?? "").toUpperCase();
  if (!normalized) return null;
  if (normalized === "PAID") return "Pago";
  if (["WAITING", "IN_ANALYSIS", "AUTHORIZED"].includes(normalized)) return "Pendente";
  if (["CANCELED", "DECLINED"].includes(normalized)) return "Cancelado";
  return null;
}

function toReais(value?: number | null) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return value / 100;
}

function extractFees(charge?: Record<string, unknown> | null) {
  const fees = (charge?.fees as Array<Record<string, unknown>> | undefined) ?? [];
  if (!Array.isArray(fees)) return null;
  const total = fees.reduce((sum, fee) => {
    const amount = (fee?.amount as { value?: number } | undefined)?.value;
    return sum + (Number.isFinite(amount) ? (amount as number) : 0);
  }, 0);
  return total > 0 ? toReais(total) : null;
}

function extractNetAmount(charge?: Record<string, unknown> | null) {
  const amount = charge?.amount as { net_amount?: number } | undefined;
  const net = amount?.net_amount;
  if (Number.isFinite(net)) return toReais(net as number);
  return null;
}

export async function POST() {
  const token = process.env.PAGBANK_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Missing configuration." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const db = supabase as any;
  const { data: cobrancas } = await supabase
    .from("cobrancas")
    .select("id, pagbank_order_id, tenant_id")
    .not("pagbank_order_id", "is", null)
    .limit(50);

  let updated = 0;
  for (const row of (cobrancas ?? []) as Array<{ id: string; pagbank_order_id?: string | null; tenant_id?: string | null }>) {
    if (!row.pagbank_order_id) continue;
    const response = await fetch(`${buildBaseUrl()}/orders/${row.pagbank_order_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) continue;
    const payload = await response.json();
    const charge = Array.isArray(payload?.charges) ? payload.charges[0] : null;
    const chargeStatus = charge?.status ?? null;
    const mapped = mapStatus(chargeStatus);
    const feeValue = extractFees(charge);
    const netValue = extractNetAmount(charge);

    await supabase
      .from("cobrancas")
      .update({
        pagbank_status: chargeStatus,
        pagbank_payload: payload,
        pagbank_updated_at: new Date().toISOString(),
        ...(feeValue !== null ? { pagbank_fee: feeValue } : {}),
        ...(netValue !== null ? { pagbank_net_amount: netValue } : {}),
        ...(mapped ? { status: mapped } : {}),
      })
      .eq("id", row.id);

    await db.from("pagbank_eventos").insert({
      order_id: row.pagbank_order_id,
      reference_id: row.id,
      charge_id: charge?.id ?? null,
      status: chargeStatus,
      payload,
      source: "reconcile",
      tenant_id: row.tenant_id ?? null,
    });
    updated += 1;
  }

  return NextResponse.json({ ok: true, updated });
}
