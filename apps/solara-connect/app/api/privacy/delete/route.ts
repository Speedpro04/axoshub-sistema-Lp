import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

async function getTenantId(supabase: any, token: string) {
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData?.user) return null;
  const { data } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();
  return (data as { tenant_id?: string } | null)?.tenant_id ?? null;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const tenantId = await getTenantId(supabase, token);
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { client_id?: string } | null;
  const clientId = body?.client_id;
  if (!clientId) {
    return NextResponse.json({ error: "client_id is required." }, { status: 400 });
  }

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!cliente) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  await supabase.from("nps_respostas").delete().eq("cliente_id", clientId).eq("tenant_id", tenantId);
  await supabase.from("agendamentos").delete().eq("cliente_id", clientId).eq("tenant_id", tenantId);
  await supabase.from("atendimentos").delete().eq("cliente_id", clientId).eq("tenant_id", tenantId);
  await supabase.from("cobrancas").delete().eq("cliente_id", clientId).eq("tenant_id", tenantId);
  await supabase.from("clientes").delete().eq("id", clientId).eq("tenant_id", tenantId);

  return NextResponse.json({ ok: true, message: "Cliente removido." });
}
