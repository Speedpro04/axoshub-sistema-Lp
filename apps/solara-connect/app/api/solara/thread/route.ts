import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ThreadRequest = {
  tenant_id?: string;
  source?: string;
  force_new?: boolean;
};

const GREETING =
  "Ola! Eu sou a Solara, consultora do sistema. Posso orientar sobre agenda, clientes, cobrancas, NPS, automacoes, kanban e WhatsApp com seguranca.";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ThreadRequest | null;
  if (!body?.tenant_id) {
    return NextResponse.json({ error: "tenant_id e obrigatorio." }, { status: 400 });
  }

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
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Invalid user token" }, { status: 401 });
  }

  const user = userData.user;
  const { data: membership } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("tenant_id", body.tenant_id)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "Usuario nao autorizado." }, { status: 403 });
  }

  const { data: existingThread } = body.force_new
    ? { data: null }
    : await supabase
        .from("solara_threads")
        .select("id, status, criado_em")
        .eq("tenant_id", body.tenant_id)
        .eq("user_id", user.id)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

  let thread = existingThread ?? null;
  let created = false;
  if (!thread?.id) {
    const { data: newThread, error: newThreadError } = await supabase
      .from("solara_threads")
      .insert({
        tenant_id: body.tenant_id,
        user_id: user.id,
        source: body.source ?? "ui",
      })
      .select("id, status, criado_em")
      .single();
    if (newThreadError || !newThread?.id) {
      return NextResponse.json(
        { error: "Falha ao criar thread da Solara." },
        { status: 500 }
      );
    }
    thread = newThread;
    created = true;
    await supabase.from("solara_messages").insert({
      thread_id: thread.id,
      role: "assistant",
      content: GREETING,
    });
  }

  const { data: messages } = await supabase
    .from("solara_messages")
    .select("id, role, content, criado_em")
    .eq("thread_id", thread.id)
    .order("criado_em", { ascending: true })
    .limit(120);

  return NextResponse.json({
    thread,
    created,
    messages: messages ?? [],
  });
}
