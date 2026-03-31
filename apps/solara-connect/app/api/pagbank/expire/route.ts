import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Missing configuration." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const db = supabase as any;
  const nowIso = new Date().toISOString();

  const { data: cobrancas } = await supabase
    .from("cobrancas")
    .select("id, pagbank_order_id, tenant_id")
    .eq("status", "Pendente")
    .lt("pagbank_expires_at", nowIso)
    .limit(100);

  let expired = 0;
  for (const row of (cobrancas ?? []) as Array<{
    id: string;
    pagbank_order_id?: string | null;
    tenant_id?: string | null;
  }>) {
    await supabase
      .from("cobrancas")
      .update({
        status: "Cancelado",
        pagbank_status: "EXPIRED",
        pagbank_updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    await db.from("pagbank_eventos").insert({
      order_id: row.pagbank_order_id ?? null,
      reference_id: row.id,
      status: "EXPIRED",
      source: "expire",
      tenant_id: row.tenant_id ?? null,
      payload: { reason: "expired" },
    });
    expired += 1;
  }

  return NextResponse.json({ ok: true, expired });
}
