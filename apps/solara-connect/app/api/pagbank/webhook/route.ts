import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function normalizeSignature(value: string) {
  return value.trim().toLowerCase();
}

function buildSignature(token: string, body: string) {
  return createHash("sha256").update(`${token}-${body}`).digest("hex");
}

function mapStatus(status?: string | null) {
  const normalized = (status ?? "").toUpperCase();
  if (!normalized) return null;
  if (normalized === "PAID") return "Pago";
  if (["WAITING", "IN_ANALYSIS", "AUTHORIZED"].includes(normalized)) return "Pendente";
  if (["CANCELED", "DECLINED"].includes(normalized)) return "Cancelado";
  return null;
}

function pickQrImage(qr?: { links?: Array<{ rel?: string; href?: string }> }) {
  if (!qr?.links) return null;
  const link = qr.links.find((item) => item.rel === "QRCODE.PNG");
  return link?.href ?? null;
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

async function insertAlert(
  supabase: any,
  input: {
    type: string;
    reference_id?: string | null;
    order_id?: string | null;
    charge_id?: string | null;
    status?: string | null;
    payload?: unknown | null;
    tenant_id?: string | null;
  }
) {
  const db = supabase as any;
  try {
    await db.from("pagbank_alertas").insert(input);
  } catch {
    // avoid throwing in webhook
  }
}

export async function POST(request: Request) {
  const webhookToken = process.env.PAGBANK_WEBHOOK_TOKEN;
  if (!webhookToken) {
    return NextResponse.json(
      { error: "PagBank webhook token not configured." },
      { status: 500 }
    );
  }

  const rawBody = await request.text();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
  const signatureHeader =
    request.headers.get("x-authenticity-token") ??
    request.headers.get("X-Authenticity-Token") ??
    "";
  if (!signatureHeader) {
    if (supabase) {
      await insertAlert(supabase, {
        type: "missing_signature",
        payload: { headers: Object.fromEntries(request.headers.entries()) },
      });
    }
    return NextResponse.json({ error: "Missing authenticity token." }, { status: 401 });
  }

  const expected = normalizeSignature(buildSignature(webhookToken, rawBody));
  const received = normalizeSignature(signatureHeader);
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);
  if (
    expectedBuf.length !== receivedBuf.length ||
    !timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    if (supabase) {
      await insertAlert(supabase, {
        type: "invalid_signature",
        payload: { headers: Object.fromEntries(request.headers.entries()) },
      });
    }
    return NextResponse.json({ error: "Invalid authenticity token." }, { status: 401 });
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    if (supabase) {
      await insertAlert(supabase, { type: "invalid_json", payload: rawBody });
    }
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const orderId =
    (payload?.id as string | undefined) ??
    ((payload?.order as { id?: string })?.id ?? null);
  const referenceId =
    (payload?.reference_id as string | undefined) ??
    ((payload?.order as { reference_id?: string })?.reference_id ?? null);

  const charges =
    (payload?.charges as Array<Record<string, unknown>> | undefined) ??
    ((payload?.order as { charges?: Array<Record<string, unknown>> })?.charges ?? []);
  const charge = charges?.[0] ?? null;
  const chargeStatus = (charge?.status as string | undefined) ?? null;
  const chargeId = (charge?.id as string | undefined) ?? null;
  const feeValue = extractFees(charge);
  const netValue = extractNetAmount(charge);

  const qrCodes =
    (payload?.qr_codes as Array<Record<string, unknown>> | undefined) ??
    ((payload?.order as { qr_codes?: Array<Record<string, unknown>> })?.qr_codes ?? []);
  const qr = qrCodes?.[0] as { text?: string; links?: Array<{ rel?: string; href?: string }> };

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase service role not configured." },
      { status: 500 }
    );
  }

  const db = supabase as any;
  let tenantId: string | null = null;
  if (referenceId) {
    const { data: cobrancaRow } = await supabase
      .from("cobrancas")
      .select("tenant_id")
      .eq("id", referenceId)
      .maybeSingle();
    tenantId = (cobrancaRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  }

  if (referenceId) {
    const updates: Record<string, unknown> = {
      pagbank_order_id: orderId ?? null,
      pagbank_reference_id: referenceId,
      pagbank_qr_code_text: qr?.text ?? null,
      pagbank_qr_code_image_url: pickQrImage(qr) ?? null,
      pagbank_status: chargeStatus ?? null,
      pagbank_charge_id: chargeId ?? null,
      pagbank_payload: payload,
      pagbank_updated_at: new Date().toISOString(),
      ...(feeValue !== null ? { pagbank_fee: feeValue } : {}),
      ...(netValue !== null ? { pagbank_net_amount: netValue } : {}),
    };

    const mappedStatus = mapStatus(chargeStatus);
    if (mappedStatus) {
      updates.status = mappedStatus;
    }

    const { error: updateError } = await supabase
      .from("cobrancas")
      .update(updates)
      .or(`id.eq.${referenceId},pagbank_reference_id.eq.${referenceId}`);
    if (updateError) {
      await insertAlert(supabase, {
        type: "update_failed",
        reference_id: referenceId,
        order_id: orderId ?? null,
        charge_id: chargeId ?? null,
        status: chargeStatus ?? null,
        payload,
        tenant_id: tenantId,
      });
      await db.from("pagbank_reprocess").insert({
        status: "pending",
        payload,
        reference_id: referenceId,
        order_id: orderId ?? null,
        charge_id: chargeId ?? null,
        tenant_id: tenantId,
      });
    }
  } else {
    await insertAlert(supabase, {
      type: "missing_reference",
      order_id: orderId ?? null,
      charge_id: chargeId ?? null,
      status: chargeStatus ?? null,
      payload,
      tenant_id: tenantId,
    });
    await db.from("pagbank_reprocess").insert({
      status: "pending",
      payload,
      reference_id: referenceId ?? null,
      order_id: orderId ?? null,
      charge_id: chargeId ?? null,
      tenant_id: tenantId,
    });
  }

  if (referenceId || orderId) {
    await db.from("pagbank_eventos").insert({
      order_id: orderId ?? null,
      reference_id: referenceId ?? null,
      charge_id: chargeId ?? null,
      status: chargeStatus ?? null,
      payload,
      tenant_id: tenantId,
    });
  }

  return NextResponse.json({ ok: true });
}
