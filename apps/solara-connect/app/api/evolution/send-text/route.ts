import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SendTextBody = {
  number?: string;
  text?: string;
  instance_id?: string;
  api_url?: string;
};

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  const withoutPrefix = digits.startsWith("00") ? digits.slice(2) : digits;
  if (withoutPrefix.startsWith("55") && withoutPrefix.length >= 12) {
    return withoutPrefix;
  }
  if (withoutPrefix.length === 10 || withoutPrefix.length === 11) {
    return `55${withoutPrefix}`;
  }
  if (
    (withoutPrefix.length === 11 || withoutPrefix.length === 12) &&
    withoutPrefix.startsWith("0")
  ) {
    return `55${withoutPrefix.slice(1)}`;
  }
  return withoutPrefix;
}

function extractUpstreamMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const direct =
    (typeof data.message === "string" && data.message) ||
    (typeof data.error === "string" && data.error) ||
    (typeof data.msg === "string" && data.msg);
  if (direct) return direct;
  const response = data.response;
  if (response && typeof response === "object") {
    const nested = response as Record<string, unknown>;
    return (
      (typeof nested.message === "string" && nested.message) ||
      (typeof nested.error === "string" && nested.error) ||
      null
    );
  }
  return null;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as SendTextBody | null;
  if (!body?.number || !body?.text) {
    return NextResponse.json(
      { error: "number e text sao obrigatorios." },
      { status: 400 }
    );
  }

  const baseUrl = body.api_url ?? process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = body.instance_id ?? process.env.EVOLUTION_INSTANCE;
  const allowWhileHuman = process.env.SOLARA_ALLOW_WHEN_HUMAN === "true";

  if (!baseUrl || !apiKey || !instance) {
    return NextResponse.json(
      { error: "Evolution API nao configurada. Preencha o .env.local." },
      { status: 500 }
    );
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

  const { data: conexao } = await supabase
    .from("evolution_conexoes")
    .select("tenant_id")
    .eq("instance_id", instance)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (!conexao?.tenant_id) {
    return NextResponse.json(
      { error: "Instancia nao vinculada a clinica ativa." },
      { status: 403 }
    );
  }

  if (!allowWhileHuman) {
    const { data: statusRow } = await supabase
      .from("solara_status")
      .select("status")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    if (statusRow?.status === "human") {
      return NextResponse.json(
        { error: "Atendimento humano ativo. Envio automatico bloqueado." },
        { status: 409 }
      );
    }
  }

  const normalizedNumber = normalizeNumber(body.number);
  if (normalizedNumber.length < 12) {
    return NextResponse.json(
      { error: "Numero invalido. Use DDD + numero (com ou sem 55)." },
      { status: 400 }
    );
  }

  const response = await fetch(
    `${normalizeBaseUrl(baseUrl)}/message/sendText/${instance}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: normalizedNumber,
        text: body.text,
      }),
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const upstream = extractUpstreamMessage(payload);
    return NextResponse.json(
      { error: upstream ?? "Falha ao enviar mensagem.", details: payload },
      { status: response.status }
    );
  }

  return NextResponse.json(payload, { status: 200 });
}
