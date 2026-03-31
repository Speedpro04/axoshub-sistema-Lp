import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        event_id?: string;
      }
    | null;
  const event_id = body?.event_id;

  if (!event_id) {
    return NextResponse.json({ error: "event_id obrigatorio" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Supabase service role not configured." },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Invalid user token" }, { status: 401 });
  }

  const userId = userData.user.id;
  const { data: tenants } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId);

  const tenantIds = (tenants ?? []).map((row) => row.tenant_id);
  if (tenantIds.length === 0) {
    return NextResponse.json({ error: "No tenant access" }, { status: 403 });
  }

  const { data: eventRow } = await supabase
    .from("evolution_eventos")
    .select("tenant_id, media_path, media_url")
    .eq("id", event_id)
    .limit(1)
    .maybeSingle();

  if (!eventRow || !tenantIds.includes(eventRow.tenant_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (eventRow.media_url && !eventRow.media_path) {
    return NextResponse.json({ url: eventRow.media_url });
  }

  if (!eventRow.media_path) {
    return NextResponse.json({ error: "No media" }, { status: 404 });
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "evolution-media";
  const { data: signed, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(eventRow.media_path, 60 * 60);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Failed to sign url" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
