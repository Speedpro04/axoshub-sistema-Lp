import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
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
  const userId = userData?.user?.id ?? null;
  if (userError || !userId) {
    return NextResponse.json({ error: "Invalid user token" }, { status: 401 });
  }

  const { data: tenantUser } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const tenantId = tenantUser?.tenant_id ?? null;
  if (!tenantId) {
    return NextResponse.json(
      { error: "Usuario sem vinculo de clinica (tenant)." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const instanceId = url.searchParams.get("instance_id");
  let query = supabase
    .from("evolution_eventos")
    .select(
      "id, event, instance_id, media_url, media_mime, media_type, media_path, payload, criado_em"
    )
    .eq("tenant_id", tenantId)
    .order("criado_em", { ascending: true })
    .limit(400);

  if (instanceId) {
    query = query.eq("instance_id", instanceId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] }, { status: 200 });
}

