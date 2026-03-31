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
    .select("*")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!cliente) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  const [cobrancas, atendimentos, agendamentos, nps] = await Promise.all([
    supabase.from("cobrancas").select("*").eq("cliente_id", clientId).eq("tenant_id", tenantId),
    supabase.from("atendimentos").select("*").eq("cliente_id", clientId).eq("tenant_id", tenantId),
    supabase.from("agendamentos").select("*").eq("cliente_id", clientId).eq("tenant_id", tenantId),
    supabase.from("nps_respostas").select("*").eq("cliente_id", clientId).eq("tenant_id", tenantId),
  ]);

  return NextResponse.json({
    cliente,
    cobrancas: cobrancas.data ?? [],
    atendimentos: atendimentos.data ?? [],
    agendamentos: agendamentos.data ?? [],
    nps_respostas: nps.data ?? [],
    exported_at: new Date().toISOString(),
  });
}
