import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ClearThreadBody = {
  event_ids?: string[];
  instance_id?: string | null;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ClearThreadBody | null;
  const ids = Array.isArray(body?.event_ids)
    ? Array.from(
        new Set(
          body!.event_ids
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        )
      )
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "event_ids obrigatorio." }, { status: 400 });
  }

  if (ids.length > 500) {
    return NextResponse.json({ error: "Limite de 500 eventos por limpeza." }, { status: 400 });
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

  let selectQuery = supabase
    .from("evolution_eventos")
    .select("id, media_path")
    .eq("tenant_id", tenantId)
    .in("id", ids);

  if (body?.instance_id) {
    selectQuery = selectQuery.eq("instance_id", body.instance_id);
  }

  const { data: allowedEvents, error: allowedError } = await selectQuery;
  if (allowedError) {
    return NextResponse.json({ error: allowedError.message }, { status: 500 });
  }

  if (!allowedEvents || allowedEvents.length === 0) {
    return NextResponse.json({ deleted: 0 }, { status: 200 });
  }

  const allowedIds = allowedEvents.map((row) => row.id);
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "evolution-media";
  const mediaPaths = allowedEvents
    .map((row) => row.media_path)
    .filter((path): path is string => Boolean(path));

  if (mediaPaths.length > 0) {
    await supabase.storage.from(bucket).remove(mediaPaths);
  }

  const { error: deleteError } = await supabase
    .from("evolution_eventos")
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", allowedIds);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: allowedIds.length }, { status: 200 });
}
