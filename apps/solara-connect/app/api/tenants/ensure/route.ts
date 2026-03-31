import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function buildTenantName(email?: string | null, metadata?: Record<string, unknown>) {
  const metaName =
    (metadata?.["tenant_name"] as string | undefined) ||
    (metadata?.["full_name"] as string | undefined);
  if (metaName) return metaName;
  if (!email) return "Nova clinica";
  return email.split("@")[0] || "Nova clinica";
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
  }

  const fastApiBaseUrl = process.env.FASTAPI_BASE_URL?.replace(/\/+$/, "");
  const useFastApiProxy = process.env.FASTAPI_PROXY_ENABLED === "true";
  if (fastApiBaseUrl && useFastApiProxy) {
    try {
      const response = await fetch(`${fastApiBaseUrl}/tenants/ensure`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const payload = await response.json().catch(() => null);
      if (response.ok) {
        return NextResponse.json(payload ?? { ok: true }, { status: 200 });
      }
      // fallback para a logica local se o FastAPI responder com erro
    } catch {
      // fallback para a logica local caso o FastAPI esteja indisponivel
    }
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

  const user = userData.user;
  const userId = user.id;
  const metadata = user.user_metadata ?? {};

  const { data: existing } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  let created = false;
  let tenantId = existing?.tenant_id ?? null;
  if (!existing?.tenant_id) {
    const metadataTenantId = metadata?.["tenant_id"] as string | undefined;
    if (metadataTenantId) {
      const { data: existingTenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("id", metadataTenantId)
        .limit(1)
        .maybeSingle();
      if (existingTenant?.id) {
        await supabase.from("tenant_users").insert({
          tenant_id: existingTenant.id,
          user_id: userId,
          role: "admin",
        });
        tenantId = existingTenant.id;
      }
    }

    if (!tenantId) {
      const tenantName = buildTenantName(user.email, metadata);
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({ nome: tenantName, ativo: true })
        .select("id")
        .single();
      if (tenantError || !tenant?.id) {
        return NextResponse.json({ error: "Failed to create tenant" }, { status: 500 });
      }

      await supabase.from("tenant_users").insert({
        tenant_id: tenant.id,
        user_id: userId,
        role: "admin",
      });
      tenantId = tenant.id;
      created = true;
    }

    await supabase.from("solara_status").insert({
      tenant_id: tenantId,
      status: "ai",
    });

    await supabase.from("solara_automation_settings").insert({
      tenant_id: tenantId,
      auto_reply_enabled: true,
      nps_enabled: true,
      nps_message:
        "Oi {cliente}! Em uma escala de 0 a 10, o quanto voce recomendaria a {clinica}?",
      birthday_enabled: true,
      birthday_message:
        "Feliz aniversario, {cliente}! A {clinica} deseja um dia especial.",
      christmas_enabled: true,
      christmas_message: "A {clinica} deseja um Feliz Natal e um otimo fim de ano!",
      newyear_enabled: true,
      newyear_message:
        "A {clinica} deseja um Feliz Ano Novo! Conte com a gente em {ano}.",
      followup_7d_enabled: true,
      followup_7d_message:
        "Oi {cliente}! Como voce esta apos a consulta? Posso ajudar em algo?",
      followup_11m_enabled: true,
      followup_11m_message:
        "Oi {cliente}, ja faz quase um ano da sua ultima consulta. Deseja agendar um retorno?",
    });
  }

  const instanceId = process.env.EVOLUTION_INSTANCE;
  const apiUrl = process.env.EVOLUTION_API_URL;
  if (tenantId && instanceId && apiUrl) {
    const defaultPhone =
      user.phone ||
      (metadata?.["phone"] as string | undefined) ||
      process.env.DEFAULT_WHATSAPP_NUMBER ||
      "5512991187251";
    const { data: existingConn } = await supabase
      .from("evolution_conexoes")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    if (!existingConn?.id) {
      await supabase.from("evolution_conexoes").insert({
        tenant_id: tenantId,
        nome: buildTenantName(user.email, metadata),
        telefone: defaultPhone,
        instance_id: instanceId,
        api_url: apiUrl,
        ativo: true,
      });
    }
  }

  return NextResponse.json({ ok: true, created, tenant_id: tenantId });
}
