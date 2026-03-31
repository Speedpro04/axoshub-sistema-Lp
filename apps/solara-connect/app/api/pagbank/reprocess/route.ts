import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

export const runtime = "nodejs";

function buildSignature(token: string, body: string) {
  return createHash("sha256").update(`${token}-${body}`).digest("hex");
}

export async function POST() {
  const webhookToken = process.env.PAGBANK_WEBHOOK_TOKEN;
  const baseUrl = process.env.APP_BASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!webhookToken || !supabaseUrl || !supabaseKey || !baseUrl) {
    return NextResponse.json({ error: "Missing configuration." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const db = supabase as any;
  const { data: queue } = await db
    .from("pagbank_reprocess")
    .select("id, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  let processed = 0;
  for (const item of (queue ?? []) as Array<{ id: string; payload: unknown; attempts?: number }>) {
    const rawBody = JSON.stringify(item.payload ?? {});
    const signature = buildSignature(webhookToken, rawBody);
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/pagbank/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-authenticity-token": signature,
      },
      body: rawBody,
    });

    if (response.ok) {
      await db
        .from("pagbank_reprocess")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", item.id);
    } else {
      await db
        .from("pagbank_reprocess")
        .update({
          attempts: (item.attempts ?? 0) + 1,
          last_error: `HTTP ${response.status}`,
        })
        .eq("id", item.id);
    }
    processed += 1;
  }

  return NextResponse.json({ ok: true, processed });
}
