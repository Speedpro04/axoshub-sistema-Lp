import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { requestGeminiReply } from "../solara-gemini";

type ChatRequest = {
  tenant_id?: string;
  thread_id?: string | null;
  message?: string;
};

type HistoryMessage = {
  role: string;
  content: string;
};

type SolaraActionType =
  | "create_client"
  | "update_client"
  | "create_appointment"
  | "update_appointment"
  | "create_payment"
  | "update_payment_status"
  | "create_atendimento"
  | "update_atendimento_status"
  | "update_automation_settings";

type SolaraAction = {
  type: SolaraActionType;
  data: Record<string, unknown>;
  requires_confirmation: boolean;
};

type PendingActionMeta = SolaraAction & {
  status: "pending" | "completed" | "failed";
  confirm_code?: string;
  requested_by?: string;
  requested_at?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  result_message?: string;
};

const ACTION_TAG_REGEX = /<solara_action>([\s\S]*?)<\/solara_action>/i;
const PAYMENT_STATUSES = new Set(["Pendente", "Pago", "Cancelado", "Atrasado"]);
const APPOINTMENT_STATUSES = new Set([
  "Agendado",
  "Confirmado",
  "Em atendimento",
  "Concluido",
  "Concluído",
  "Cancelado",
]);
const ATENDIMENTO_STATUSES = new Set([
  "Novo",
  "Em andamento",
  "Concluido",
  "Concluído",
  "Cancelado",
]);

export const runtime = "nodejs";

function normalizeReplyText(text: string) {
  if (!text) return "Tudo certo. Posso ajudar em algo mais?";
  return text.trim();
}

function toStringValue(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toBooleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function parseConfirmationMessage(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized.startsWith("confirmar")) {
    return { isConfirm: false, code: null as string | null };
  }
  const parts = value.trim().split(/\s+/);
  return { isConfirm: true, code: parts.length > 1 ? parts[1].trim() : null };
}

function generateConfirmCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function parseActionFromText(text: string) {
  const match = text.match(ACTION_TAG_REGEX);
  if (!match) return { action: null as SolaraAction | null, cleaned: text };
  let action: SolaraAction | null = null;
  try {
    action = JSON.parse(match[1]) as SolaraAction;
  } catch {
    action = null;
  }
  return {
    action,
    cleaned: text.replace(ACTION_TAG_REGEX, "").trim(),
  };
}

function normalizeAction(action: SolaraAction | null) {
  if (!action || !action.type || typeof action.data !== "object" || !action.data) {
    return { ok: false as const, reason: "Acao ausente ou invalida." };
  }

  const data = action.data;

  if (action.type === "create_client") {
    const nome = toStringValue(data.nome);
    const telefone = toStringValue(data.telefone);
    if (!nome || !telefone) {
      return { ok: false as const, reason: "create_client exige nome e telefone." };
    }
    return {
      ok: true as const,
      action: {
        type: action.type,
        requires_confirmation: true,
        data: {
          nome,
          telefone,
          email: toStringValue(data.email),
          tax_id: toStringValue(data.tax_id),
          clinica_nome: toStringValue(data.clinica_nome),
          clinica_cnpj: toStringValue(data.clinica_cnpj),
          status: toStringValue(data.status) ?? "Novo",
        },
      },
    };
  }

  if (action.type === "update_client") {
    const id = toStringValue(data.id);
    if (!id) return { ok: false as const, reason: "update_client exige id." };
    return {
      ok: true as const,
      action: {
        type: action.type,
        requires_confirmation: true,
        data: {
          id,
          nome: toStringValue(data.nome),
          telefone: toStringValue(data.telefone),
          email: toStringValue(data.email),
          tax_id: toStringValue(data.tax_id),
          clinica_nome: toStringValue(data.clinica_nome),
          clinica_cnpj: toStringValue(data.clinica_cnpj),
          status: toStringValue(data.status),
        },
      },
    };
  }

  if (action.type === "create_appointment") {
    const cliente_id = toStringValue(data.cliente_id);
    const especialista_id = toStringValue(data.especialista_id);
    const data_hora = toStringValue(data.data_hora);
    if (!cliente_id || !especialista_id || !data_hora) {
      return {
        ok: false as const,
        reason: "create_appointment exige cliente_id, especialista_id e data_hora.",
      };
    }
    const status = toStringValue(data.status) ?? "Agendado";
    if (!APPOINTMENT_STATUSES.has(status)) {
      return { ok: false as const, reason: "Status de agendamento invalido." };
    }
    return {
      ok: true as const,
      action: {
        type: action.type,
        requires_confirmation: true,
        data: { cliente_id, especialista_id, data_hora, status },
      },
    };
  }

  if (action.type === "update_appointment") {
    const id = toStringValue(data.id);
    if (!id) return { ok: false as const, reason: "update_appointment exige id." };
    const status = toStringValue(data.status);
    if (status && !APPOINTMENT_STATUSES.has(status)) {
      return { ok: false as const, reason: "Status de agendamento invalido." };
    }
    return {
      ok: true as const,
      action: {
        type: action.type,
        requires_confirmation: true,
        data: {
          id,
          cliente_id: toStringValue(data.cliente_id),
          especialista_id: toStringValue(data.especialista_id),
          data_hora: toStringValue(data.data_hora),
          status,
        },
      },
    };
  }

  if (action.type === "create_payment") {
    const cliente_id = toStringValue(data.cliente_id);
    const valor = toNumberValue(data.valor);
    if (!cliente_id || !valor || valor <= 0) {
      return { ok: false as const, reason: "create_payment exige cliente_id e valor valido." };
    }
    const status = toStringValue(data.status) ?? "Pendente";
    if (!PAYMENT_STATUSES.has(status)) {
      return { ok: false as const, reason: "Status de cobranca invalido." };
    }
    return {
      ok: true as const,
      action: {
        type: action.type,
        requires_confirmation: true,
        data: {
          cliente_id,
          valor,
          status,
          vencimento: toStringValue(data.vencimento),
        },
      },
    };
  }

  if (action.type === "update_payment_status") {
    const id = toStringValue(data.id);
    const status = toStringValue(data.status);
    if (!id || !status || !PAYMENT_STATUSES.has(status)) {
      return {
        ok: false as const,
        reason: "update_payment_status exige id e status valido.",
      };
    }
    return {
      ok: true as const,
      action: {
        type: action.type,
        requires_confirmation: true,
        data: { id, status },
      },
    };
  }

  if (action.type === "create_atendimento") {
    const status = toStringValue(data.status) ?? "Novo";
    if (!ATENDIMENTO_STATUSES.has(status)) {
      return { ok: false as const, reason: "Status de atendimento invalido." };
    }
    return {
      ok: true as const,
      action: {
        type: action.type,
        requires_confirmation: true,
        data: {
          cliente_id: toStringValue(data.cliente_id),
          status,
          canal: toStringValue(data.canal),
          responsavel: toStringValue(data.responsavel) ?? "Solara",
        },
      },
    };
  }

  if (action.type === "update_atendimento_status") {
    const id = toStringValue(data.id);
    const status = toStringValue(data.status);
    if (!id || !status || !ATENDIMENTO_STATUSES.has(status)) {
      return {
        ok: false as const,
        reason: "update_atendimento_status exige id e status valido.",
      };
    }
    return {
      ok: true as const,
      action: {
        type: action.type,
        requires_confirmation: true,
        data: { id, status },
      },
    };
  }

  if (action.type === "update_automation_settings") {
    const allowed = [
      "auto_reply_enabled",
      "nps_enabled",
      "nps_message",
      "birthday_enabled",
      "birthday_message",
      "christmas_enabled",
      "christmas_message",
      "newyear_enabled",
      "newyear_message",
      "followup_7d_enabled",
      "followup_7d_message",
      "followup_11m_enabled",
      "followup_11m_message",
    ] as const;

    const payload: Record<string, unknown> = {};
    for (const key of allowed) {
      const value = data[key];
      if (value === undefined) continue;
      if (key.endsWith("_enabled")) {
        const boolValue = toBooleanValue(value);
        if (boolValue === null) {
          return {
            ok: false as const,
            reason: `Campo ${key} precisa ser booleano.`,
          };
        }
        payload[key] = boolValue;
      } else {
        const textValue = toStringValue(value);
        if (!textValue) {
          return {
            ok: false as const,
            reason: `Campo ${key} precisa ser texto valido.`,
          };
        }
        payload[key] = textValue;
      }
    }

    if (!Object.keys(payload).length) {
      return {
        ok: false as const,
        reason: "update_automation_settings sem campos validos.",
      };
    }

    return {
      ok: true as const,
      action: {
        type: action.type,
        requires_confirmation: true,
        data: payload,
      },
    };
  }

  return { ok: false as const, reason: "Tipo de acao nao suportado." };
}

async function logSecurityEvent(
  supabase: SupabaseClient,
  tenantId: string,
  actorUserId: string,
  action: string,
  details: Record<string, unknown>
) {
  try {
    await supabase.from("lgpd_auditoria").insert({
      tenant_id: tenantId,
      actor_user_id: actorUserId,
      acao: action,
      alvo_tabela: "solara_messages",
      detalhes: details,
    });
  } catch {
    // best effort logging
  }
}

async function ensureThreadAccess(
  supabase: SupabaseClient,
  threadId: string,
  tenantId: string,
  userId: string
) {
  const { data } = await supabase
    .from("solara_threads")
    .select("id, user_id")
    .eq("id", threadId)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (!data?.id) return false;
  return data.user_id === userId;
}

async function existsByTenant(
  supabase: SupabaseClient,
  table: string,
  tenantId: string,
  id: string
) {
  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

async function executeAction(
  supabase: SupabaseClient,
  tenantId: string,
  action: SolaraAction
) {
  const data = action.data;

  if (action.type === "create_client") {
    const { data: created, error } = await supabase
      .from("clientes")
      .insert({
        tenant_id: tenantId,
        nome: data.nome,
        telefone: data.telefone,
        email: data.email ?? null,
        tax_id: data.tax_id ?? null,
        clinica_nome: data.clinica_nome ?? null,
        clinica_cnpj: data.clinica_cnpj ?? null,
        status: data.status ?? "Novo",
      })
      .select("id, nome")
      .single();
    if (error) return { ok: false, message: "Falha ao criar cliente." };
    return { ok: true, message: `Cliente criado: ${created?.nome ?? "novo cliente"}.` };
  }

  if (action.type === "update_client") {
    const id = String(data.id);
    if (!(await existsByTenant(supabase, "clientes", tenantId, id))) {
      return { ok: false, message: "Cliente nao encontrado para este tenant." };
    }
    const { data: updated, error } = await supabase
      .from("clientes")
      .update({
        nome: data.nome ?? undefined,
        telefone: data.telefone ?? undefined,
        email: data.email ?? undefined,
        tax_id: data.tax_id ?? undefined,
        clinica_nome: data.clinica_nome ?? undefined,
        clinica_cnpj: data.clinica_cnpj ?? undefined,
        status: data.status ?? undefined,
      })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("id, nome")
      .single();
    if (error) return { ok: false, message: "Falha ao atualizar cliente." };
    return { ok: true, message: `Cliente atualizado: ${updated?.nome ?? "cliente"}.` };
  }

  if (action.type === "create_appointment") {
    const clienteId = String(data.cliente_id);
    const especialistaId = String(data.especialista_id);
    const hasClient = await existsByTenant(supabase, "clientes", tenantId, clienteId);
    const hasSpecialist = await existsByTenant(
      supabase,
      "especialistas",
      tenantId,
      especialistaId
    );
    if (!hasClient || !hasSpecialist) {
      return {
        ok: false,
        message: "Cliente ou especialista nao encontrado para este tenant.",
      };
    }
    const { error } = await supabase.from("agendamentos").insert({
      tenant_id: tenantId,
      cliente_id: clienteId,
      especialista_id: especialistaId,
      data_hora: data.data_hora,
      status: data.status ?? "Agendado",
    });
    if (error) return { ok: false, message: "Falha ao criar agendamento." };
    return { ok: true, message: "Agendamento criado com sucesso." };
  }

  if (action.type === "update_appointment") {
    const id = String(data.id);
    if (!(await existsByTenant(supabase, "agendamentos", tenantId, id))) {
      return { ok: false, message: "Agendamento nao encontrado para este tenant." };
    }
    const { error } = await supabase
      .from("agendamentos")
      .update({
        cliente_id: data.cliente_id ?? undefined,
        especialista_id: data.especialista_id ?? undefined,
        data_hora: data.data_hora ?? undefined,
        status: data.status ?? undefined,
      })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) return { ok: false, message: "Falha ao atualizar agendamento." };
    return { ok: true, message: "Agendamento atualizado com sucesso." };
  }

  if (action.type === "create_payment") {
    const clientId = String(data.cliente_id);
    if (!(await existsByTenant(supabase, "clientes", tenantId, clientId))) {
      return { ok: false, message: "Cliente nao encontrado para este tenant." };
    }
    const { error } = await supabase.from("cobrancas").insert({
      tenant_id: tenantId,
      cliente_id: clientId,
      valor: data.valor,
      status: data.status ?? "Pendente",
      vencimento: data.vencimento ?? null,
    });
    if (error) return { ok: false, message: "Falha ao criar cobranca." };
    return { ok: true, message: "Cobranca criada com sucesso." };
  }

  if (action.type === "update_payment_status") {
    const id = String(data.id);
    if (!(await existsByTenant(supabase, "cobrancas", tenantId, id))) {
      return { ok: false, message: "Cobranca nao encontrada para este tenant." };
    }
    const { error } = await supabase
      .from("cobrancas")
      .update({ status: data.status })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) return { ok: false, message: "Falha ao atualizar cobranca." };
    return { ok: true, message: "Cobranca atualizada com sucesso." };
  }

  if (action.type === "create_atendimento") {
    if (data.cliente_id) {
      const hasClient = await existsByTenant(
        supabase,
        "clientes",
        tenantId,
        String(data.cliente_id)
      );
      if (!hasClient) {
        return { ok: false, message: "Cliente nao encontrado para este tenant." };
      }
    }
    const { error } = await supabase.from("atendimentos").insert({
      tenant_id: tenantId,
      cliente_id: data.cliente_id ?? null,
      status: data.status ?? "Novo",
      canal: data.canal ?? null,
      responsavel: data.responsavel ?? "Solara",
    });
    if (error) return { ok: false, message: "Falha ao criar atendimento." };
    return { ok: true, message: "Atendimento criado com sucesso." };
  }

  if (action.type === "update_atendimento_status") {
    const id = String(data.id);
    if (!(await existsByTenant(supabase, "atendimentos", tenantId, id))) {
      return { ok: false, message: "Atendimento nao encontrado para este tenant." };
    }
    const { error } = await supabase
      .from("atendimentos")
      .update({ status: data.status })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) return { ok: false, message: "Falha ao atualizar atendimento." };
    return { ok: true, message: "Atendimento atualizado com sucesso." };
  }

  if (action.type === "update_automation_settings") {
    const { error } = await supabase
      .from("solara_automation_settings")
      .upsert(
        { tenant_id: tenantId, ...data, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id" }
      );
    if (error) return { ok: false, message: "Falha ao atualizar automacoes." };
    return { ok: true, message: "Automacoes atualizadas com sucesso." };
  }

  return { ok: false, message: "Acao nao suportada." };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChatRequest | null;
  const rawMessage = body?.message ?? "";
  const message = rawMessage.trim();
  if (!body?.tenant_id || !message) {
    return NextResponse.json(
      { error: "tenant_id e message sao obrigatorios." },
      { status: 400 }
    );
  }
  if (message.length > 2000) {
    return NextResponse.json(
      { error: "Mensagem muito longa. Resuma e tente novamente." },
      { status: 400 }
    );
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

  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("nome")
    .eq("id", body.tenant_id)
    .limit(1)
    .maybeSingle();
  const clinicaNome = tenantRow?.nome ?? "sua clinica";

  let threadId = body.thread_id ?? null;
  if (threadId) {
    const allowed = await ensureThreadAccess(supabase, threadId, body.tenant_id, user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Thread invalida para este usuario/tenant." },
        { status: 403 }
      );
    }
  } else {
    const { data: newThread, error: newThreadError } = await supabase
      .from("solara_threads")
      .insert({
        tenant_id: body.tenant_id,
        user_id: user.id,
        source: "ui",
      })
      .select("id")
      .single();
    if (newThreadError || !newThread?.id) {
      return NextResponse.json(
        { error: "Falha ao criar thread da Solara." },
        { status: 500 }
      );
    }
    threadId = newThread.id;
  }

  const allowWhileHuman = process.env.SOLARA_ALLOW_WHEN_HUMAN === "true";
  const { data: statusRow } = await supabase
    .from("solara_status")
    .select("status")
    .eq("tenant_id", body.tenant_id)
    .limit(1)
    .maybeSingle();
  if (!allowWhileHuman && statusRow?.status === "human") {
    const blockedMessage = "Atendimento humano ativo. Avisei a equipe e retorno em breve.";
    const { data: replyRow } = await supabase
      .from("solara_messages")
      .insert({
        thread_id: threadId,
        role: "assistant",
        content: blockedMessage,
        metadata: { blocked: true },
      })
      .select("id")
      .single();
    return NextResponse.json({
      thread_id: threadId,
      reply: { id: replyRow?.id ?? null, content: blockedMessage },
    });
  }

  const confirmInfo = parseConfirmationMessage(message);
  if (confirmInfo.isConfirm) {
    const { data: recentMessages } = await supabase
      .from("solara_messages")
      .select("id, role, content, metadata, criado_em")
      .eq("thread_id", threadId)
      .order("criado_em", { ascending: false })
      .limit(30);

    const pending = (recentMessages ?? []).find((item) => {
      if (item.role !== "assistant") return false;
      const meta = item.metadata as { action?: PendingActionMeta } | undefined;
      return (
        meta?.action?.status === "pending" &&
        meta?.action?.requested_by === user.id
      );
    });

    if (!pending) {
      const content = "Nao encontrei nenhuma acao pendente para confirmar.";
      await supabase.from("solara_messages").insert({
        thread_id: threadId,
        role: "assistant",
        content,
        metadata: { confirmation: "missing" },
      });
      return NextResponse.json({
        thread_id: threadId,
        reply: { id: null, content },
      });
    }

    const meta = pending.metadata as { action?: PendingActionMeta } | undefined;
    const action = meta?.action;
    if (!action) {
      return NextResponse.json(
        { thread_id: threadId, reply: { id: null, content: "Acao pendente invalida." } },
        { status: 400 }
      );
    }

    if (!confirmInfo.code || !action.confirm_code) {
      const content = `Confirmacao incompleta. Use: CONFIRMAR ${action.confirm_code ?? "CODIGO"}.`;
      await supabase.from("solara_messages").insert({
        thread_id: threadId,
        role: "assistant",
        content,
        metadata: { confirmation: "code_required" },
      });
      return NextResponse.json({
        thread_id: threadId,
        reply: { id: null, content },
      });
    }

    if (confirmInfo.code !== action.confirm_code) {
      const content = "Codigo de confirmacao invalido. Confira e tente novamente.";
      await supabase.from("solara_messages").insert({
        thread_id: threadId,
        role: "assistant",
        content,
        metadata: { confirmation: "invalid_code" },
      });
      await logSecurityEvent(supabase, body.tenant_id, user.id, "solara_action_invalid_code", {
        thread_id: threadId,
        action_type: action.type,
      });
      return NextResponse.json({
        thread_id: threadId,
        reply: { id: null, content },
      });
    }

    const normalized = normalizeAction(action);
    if (!normalized.ok) {
      const content = "A acao pendente esta invalida e foi bloqueada por seguranca.";
      await supabase
        .from("solara_messages")
        .update({
          metadata: {
            ...(pending.metadata as Record<string, unknown>),
            action: {
              ...(action as Record<string, unknown>),
              status: "failed",
              result_message: normalized.reason,
            },
          },
        })
        .eq("id", pending.id);
      await supabase.from("solara_messages").insert({
        thread_id: threadId,
        role: "assistant",
        content,
        metadata: { action_result: false },
      });
      return NextResponse.json({
        thread_id: threadId,
        reply: { id: null, content },
      });
    }

    const actionResult = await executeAction(supabase, body.tenant_id, normalized.action);
    await supabase
      .from("solara_messages")
      .update({
        metadata: {
          ...(pending.metadata as Record<string, unknown>),
          action: {
            ...(action as Record<string, unknown>),
            status: actionResult.ok ? "completed" : "failed",
            confirmed_by: user.id,
            confirmed_at: new Date().toISOString(),
            result_message: actionResult.message,
          },
        },
      })
      .eq("id", pending.id);

    await supabase.from("solara_messages").insert({
      thread_id: threadId,
      role: "assistant",
      content: actionResult.message,
      metadata: { action_result: actionResult.ok },
    });

    await logSecurityEvent(
      supabase,
      body.tenant_id,
      user.id,
      "solara_action_execute",
      {
        thread_id: threadId,
        action_type: action.type,
        ok: actionResult.ok,
        message: actionResult.message,
      }
    );

    return NextResponse.json({
      thread_id: threadId,
      reply: { id: null, content: actionResult.message },
    });
  }

  await supabase.from("solara_messages").insert({
    thread_id: threadId,
    role: "user",
    content: message,
  });

  const [
    clientesCount,
    especialistasCount,
    agendamentosCount,
    cobrancasCount,
    atendimentosCount,
    npsCount,
    conexoesCount,
  ] = await Promise.all([
    supabase
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", body.tenant_id),
    supabase
      .from("especialistas")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", body.tenant_id),
    supabase
      .from("agendamentos")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", body.tenant_id),
    supabase
      .from("cobrancas")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", body.tenant_id),
    supabase
      .from("atendimentos")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", body.tenant_id),
    supabase
      .from("nps_respostas")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", body.tenant_id),
    supabase
      .from("evolution_conexoes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", body.tenant_id),
  ]);

  const [
    upcomingAgendamentos,
    recentClientes,
    recentEspecialistas,
    recentCobrancas,
    recentAtendimentos,
    recentNps,
    automationSettings,
    recentConnections,
    recentEvents,
    recentPagbankAlerts,
    recentPagbankEvents,
  ] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("id, data_hora, status, cliente_id, especialista_id")
      .eq("tenant_id", body.tenant_id)
      .gte("data_hora", new Date().toISOString())
      .order("data_hora", { ascending: true })
      .limit(8),
    supabase
      .from("clientes")
      .select("id, nome, telefone, email, tax_id, clinica_nome, clinica_cnpj, status")
      .eq("tenant_id", body.tenant_id)
      .order("criado_em", { ascending: false })
      .limit(12),
    supabase
      .from("especialistas")
      .select("id, nome, especialidade, ativo")
      .eq("tenant_id", body.tenant_id)
      .order("criado_em", { ascending: false })
      .limit(12),
    supabase
      .from("cobrancas")
      .select("id, cliente_id, valor, status, vencimento, criado_em")
      .eq("tenant_id", body.tenant_id)
      .order("criado_em", { ascending: false })
      .limit(12),
    supabase
      .from("atendimentos")
      .select("id, cliente_id, status, canal, responsavel, criado_em")
      .eq("tenant_id", body.tenant_id)
      .order("criado_em", { ascending: false })
      .limit(12),
    supabase
      .from("nps_respostas")
      .select("id, cliente_id, nota, comentario, criado_em")
      .eq("tenant_id", body.tenant_id)
      .order("criado_em", { ascending: false })
      .limit(12),
    supabase
      .from("solara_automation_settings")
      .select("*")
      .eq("tenant_id", body.tenant_id)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("evolution_conexoes")
      .select("id, nome, telefone, instance_id, ativo, criado_em")
      .eq("tenant_id", body.tenant_id)
      .order("criado_em", { ascending: false })
      .limit(8),
    supabase
      .from("evolution_eventos")
      .select("id, event, instance_id, media_type, criado_em")
      .eq("tenant_id", body.tenant_id)
      .order("criado_em", { ascending: false })
      .limit(8),
    supabase
      .from("pagbank_alertas")
      .select("id, type, status, created_at")
      .eq("tenant_id", body.tenant_id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("pagbank_eventos")
      .select("id, status, source, created_at")
      .eq("tenant_id", body.tenant_id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const statusCount = (recentAtendimentos.data ?? []).reduce<Record<string, number>>(
    (acc, item) => {
      const key = item.status ?? "Sem status";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const context = {
    tenant_id: body.tenant_id,
    clinica_nome: clinicaNome,
    modules: {
      clientes: {
        total: clientesCount.count ?? 0,
        recentes: recentClientes.data ?? [],
      },
      especialistas: {
        total: especialistasCount.count ?? 0,
        recentes: recentEspecialistas.data ?? [],
      },
      agenda: {
        total: agendamentosCount.count ?? 0,
        proximos: upcomingAgendamentos.data ?? [],
      },
      cobrancas: {
        total: cobrancasCount.count ?? 0,
        recentes: recentCobrancas.data ?? [],
      },
      kanban: {
        total: atendimentosCount.count ?? 0,
        por_status: statusCount,
        recentes: recentAtendimentos.data ?? [],
      },
      nps: {
        total: npsCount.count ?? 0,
        recentes: recentNps.data ?? [],
      },
      automacoes: automationSettings.data ?? null,
      whatsapp: {
        conexoes_ativas_total: conexoesCount.count ?? 0,
        conexoes_recentes: recentConnections.data ?? [],
        eventos_recentes: recentEvents.data ?? [],
      },
      pagbank: {
        alertas_recentes: recentPagbankAlerts.data ?? [],
        eventos_recentes: recentPagbankEvents.data ?? [],
      },
    },
    guard_rails: {
      tenant_isolation: true,
      read_scope: "tenant_only",
      write_scope: "tenant_only_with_confirmation_code",
      confirmation_pattern: "CONFIRMAR <codigo>",
    },
    now: new Date().toISOString(),
  };

  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  if (!geminiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY nao configurada." },
      { status: 500 }
    );
  }

  const { data: history } = await supabase
    .from("solara_messages")
    .select("role, content, criado_em")
    .eq("thread_id", threadId)
    .order("criado_em", { ascending: true })
    .limit(20);

  const geminiResult = await requestGeminiReply({
    apiKey: geminiKey,
    model: geminiModel,
    context,
    history: (history ?? []).map((item: HistoryMessage) => ({
      role: item.role,
      content: item.content,
    })),
  });

  if (!geminiResult.ok) {
    return NextResponse.json(
      { error: "Falha ao consultar o Gemini.", details: geminiResult.error },
      { status: 502 }
    );
  }

  const parsed = parseActionFromText(geminiResult.replyText);
  const replyText = normalizeReplyText(parsed.cleaned);
  const normalizedAction = normalizeAction(parsed.action);

  let finalReplyContent = replyText;
  let actionMetadata: PendingActionMeta | undefined;

  if (normalizedAction.ok) {
    const code = generateConfirmCode();
    actionMetadata = {
      ...normalizedAction.action,
      status: "pending",
      confirm_code: code,
      requested_by: user.id,
      requested_at: new Date().toISOString(),
    };
    finalReplyContent = `${replyText}\n\nPara executar com total seguranca, responda: CONFIRMAR ${code}`;
  } else if (parsed.action) {
    await logSecurityEvent(supabase, body.tenant_id, user.id, "solara_action_blocked", {
      reason: normalizedAction.reason,
      proposed_type: parsed.action.type,
    });
  }

  const { data: replyRow } = await supabase
    .from("solara_messages")
    .insert({
      thread_id: threadId,
      role: "assistant",
      content: finalReplyContent,
      metadata: {
        model: geminiModel,
        action: actionMetadata,
      },
    })
    .select("id")
    .single();

  return NextResponse.json({
    thread_id: threadId,
    reply: { id: replyRow?.id ?? null, content: finalReplyContent },
  });
}
