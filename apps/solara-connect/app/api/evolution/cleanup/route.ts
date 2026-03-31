import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Supabase service role not configured." },
      { status: 500 }
    );
  }

  const days = Number(process.env.MEDIA_RETENTION_DAYS ?? "90");
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "evolution-media";

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: oldEvents } = await supabase
    .from("evolution_eventos")
    .select("id, media_path")
    .not("media_path", "is", null)
    .lt("criado_em", cutoff)
    .limit(200);

  if (!oldEvents || oldEvents.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  const paths = oldEvents.map((item) => item.media_path).filter(Boolean) as string[];
  if (paths.length > 0) {
    await supabase.storage.from(bucket).remove(paths);
  }

  const ids = oldEvents.map((item) => item.id);
  await supabase.from("evolution_eventos").delete().in("id", ids);

  return NextResponse.json({ deleted: ids.length });
}
