import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function buildCutoff(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const retentionDays = Number(process.env.LGPD_RETENTION_DAYS ?? "180");
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const cutoff = buildCutoff(Number.isFinite(retentionDays) ? retentionDays : 180);

  const tables = [
    { name: "pagbank_eventos", date: "created_at" },
    { name: "pagbank_alertas", date: "created_at" },
    { name: "pagbank_reprocess", date: "created_at" },
    { name: "evolution_eventos", date: "criado_em" },
  ];

  const results: Record<string, number> = {};
  for (const table of tables) {
    const { data } = await supabase
      .from(table.name)
      .delete()
      .lt(table.date, cutoff)
      .select("id");
    results[table.name] = data?.length ?? 0;
  }

  return NextResponse.json({ ok: true, removed: results, cutoff });
}
