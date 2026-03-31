import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appBaseUrl = process.env.APP_BASE_URL;
  const alertPhone =
    process.env.PAGBANK_ALERT_PHONE || process.env.DEFAULT_WHATSAPP_NUMBER;
  const alertWebhook = process.env.PAGBANK_ALERT_WEBHOOK_URL;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Missing configuration." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const db = supabase as any;
  const { data: alerts } = await db
    .from("pagbank_alertas")
    .select("id, type, reference_id, order_id, charge_id, status, created_at")
    .is("notified_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  let notified = 0;
  for (const alert of (alerts ?? []) as Array<Record<string, unknown>>) {
    const message = `PagBank alerta: ${(alert.type as string) ?? "evento"}\nReferencia: ${
      (alert.reference_id as string) ?? "-"
    }\nPedido: ${(alert.order_id as string) ?? "-"}\nStatus: ${
      (alert.status as string) ?? "-"
    }`;

    let channel: string | null = null;
    if (alertPhone && appBaseUrl) {
      const response = await fetch(`${appBaseUrl.replace(/\/$/, "")}/api/evolution/send-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: alertPhone, text: message }),
      });
      if (response.ok) {
        channel = "whatsapp";
      }
    }

    if (!channel && alertWebhook) {
      const response = await fetch(alertWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert, message }),
      });
      if (response.ok) {
        channel = "webhook";
      }
    }

    if (channel) {
      await db
        .from("pagbank_alertas")
        .update({ notified_at: new Date().toISOString(), notify_channel: channel })
        .eq("id", alert.id as string);
      notified += 1;
    }
  }

  return NextResponse.json({ ok: true, notified });
}
