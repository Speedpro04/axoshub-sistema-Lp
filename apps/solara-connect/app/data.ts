import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase-client";

export type ClientRow = {
  id: string;
  nome: string;
  telefone: string;
  email?: string | null;
  tax_id?: string | null;
  status: string;
  tenant_id?: string | null;
};

export type SpecialistRow = {
  id: string;
  nome: string;
  especialidade: string;
  ativo: boolean;
  tenant_id?: string | null;
};

export type AppointmentRow = {
  id: string;
  cliente_id: string;
  especialista_id: string;
  data_hora: string;
  status: string;
  tenant_id?: string | null;
};

export type PaymentRow = {
  id: string;
  cliente_id: string;
  valor: number | string;
  status: string;
  pagbank_order_id?: string | null;
  pagbank_reference_id?: string | null;
  pagbank_qr_code_text?: string | null;
  pagbank_qr_code_image_url?: string | null;
  pagbank_status?: string | null;
  pagbank_charge_id?: string | null;
  pagbank_payload?: unknown | null;
  pagbank_updated_at?: string | null;
  pagbank_expires_at?: string | null;
  pagbank_fee?: number | null;
  pagbank_net_amount?: number | null;
  tenant_id?: string | null;
};

export type AtendimentoRow = {
  id: string;
  cliente_id: string | null;
  status: string;
  canal: string | null;
  responsavel: string | null;
  tenant_id?: string | null;
};

export type EvolutionConnectionRow = {
  id: string;
  nome: string;
  telefone: string;
  instance_id: string;
  api_url: string;
  ativo: boolean;
  criado_em?: string;
  tenant_id?: string | null;
};

export type EvolutionEventRow = {
  id: string;
  event: string | null;
  instance_id: string | null;
  media_url?: string | null;
  media_mime?: string | null;
  media_type?: string | null;
  media_path?: string | null;
  payload: unknown;
  criado_em?: string;
  tenant_id?: string | null;
};

export type SolaraStatusRow = {
  id: string;
  tenant_id: string;
  status: "ai" | "human";
  updated_at?: string | null;
};

export type NpsRow = {
  id: string;
  tenant_id: string | null;
  cliente_id: string | null;
  atendimento_id: string | null;
  agendamento_id?: string | null;
  nota: number | null;
  comentario?: string | null;
  criado_em?: string | null;
  enviada_em?: string | null;
  respondida_em?: string | null;
};

export type PagbankAlertRow = {
  id: string;
  type: string;
  reference_id?: string | null;
  order_id?: string | null;
  charge_id?: string | null;
  status?: string | null;
  payload?: unknown | null;
  notified_at?: string | null;
  notify_channel?: string | null;
  created_at?: string | null;
};

export type PagbankEventRow = {
  id: string;
  order_id?: string | null;
  reference_id?: string | null;
  charge_id?: string | null;
  status?: string | null;
  payload?: unknown | null;
  source?: string | null;
  created_at?: string | null;
};

export type SolaraAutomationSettingsRow = {
  tenant_id: string;
  auto_reply_enabled?: boolean | null;
  nps_enabled?: boolean | null;
  nps_message?: string | null;
  birthday_enabled?: boolean | null;
  birthday_message?: string | null;
  christmas_enabled?: boolean | null;
  christmas_message?: string | null;
  newyear_enabled?: boolean | null;
  newyear_message?: string | null;
  followup_7d_enabled?: boolean | null;
  followup_7d_message?: string | null;
  followup_11m_enabled?: boolean | null;
  followup_11m_message?: string | null;
  updated_at?: string | null;
};

type TenantUserRow = {
  tenant_id: string;
};

export type TenantRow = {
  id: string;
  nome: string;
  nome_real?: string | null;
  cnpj?: string | null;
  slug?: string | null;
  ativo?: boolean | null;
  billing_status?: string | null;
  criado_em?: string | null;
};

let cachedTenantId: string | null = null;

export function setActiveTenantId(tenantId: string | null) {
  cachedTenantId = tenantId;
}

async function getActiveTenantId(client: SupabaseClient | null) {
  if (!client) return null;
  if (cachedTenantId) return cachedTenantId;
  const { data, error } = await client
    .from("tenant_users")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  cachedTenantId = (data as TenantUserRow).tenant_id ?? null;
  return cachedTenantId;
}

export async function fetchUserTenants() {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from("tenant_users")
    .select(
      "tenant_id, tenants(id, nome, nome_real, cnpj, slug, ativo, billing_status, criado_em)"
    )
    .limit(50);
  if (error || !data) return [];
  return data
    .map((row) => {
      const tenants = (row as { tenants?: TenantRow | TenantRow[] | null }).tenants;
      if (!tenants) return null;
      return Array.isArray(tenants) ? tenants[0] ?? null : tenants;
    })
    .filter((item): item is TenantRow => Boolean(item));
}

async function safeQuery<T>(
  client: SupabaseClient | null,
  table: string,
  columns = "*",
  limit = 30,
  tenantId?: string | null
): Promise<T[]> {
  if (!client) return [];
  let query = client.from(table).select(columns).limit(limit);
  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data as T[];
}

export async function fetchDashboardData() {
  const client = getSupabaseClient();
  const tenantId = await getActiveTenantId(client);

  const [
    clientes,
    especialistas,
    agendamentos,
    cobrancas,
    atendimentos,
    conexoes,
    eventos,
    npsRespostas,
    pagbankAlertas,
    pagbankEventos,
  ] =
    await Promise.all([
      safeQuery<ClientRow>(
        client,
        "clientes",
        "id, nome, telefone, email, tax_id, status",
        30,
        tenantId
      ),
      safeQuery<SpecialistRow>(
        client,
        "especialistas",
        "id, nome, especialidade, ativo",
        30,
        tenantId
      ),
      safeQuery<AppointmentRow>(
        client,
        "agendamentos",
        "id, cliente_id, especialista_id, data_hora, status",
        30,
        tenantId
      ),
      safeQuery<PaymentRow>(
        client,
        "cobrancas",
        "id, cliente_id, valor, status, pagbank_order_id, pagbank_reference_id, pagbank_qr_code_text, pagbank_qr_code_image_url, pagbank_status, pagbank_charge_id, pagbank_payload, pagbank_updated_at, pagbank_expires_at, pagbank_fee, pagbank_net_amount",
        30,
        tenantId
      ),
      safeQuery<AtendimentoRow>(
        client,
        "atendimentos",
        "id, cliente_id, status, canal, responsavel",
        30,
        tenantId
      ),
      safeQuery<EvolutionConnectionRow>(
        client,
        "evolution_conexoes",
        "id, nome, telefone, instance_id, api_url, ativo, criado_em",
        30,
        tenantId
      ),
      safeQuery<EvolutionEventRow>(
        client,
        "evolution_eventos",
        "id, event, instance_id, media_url, media_mime, media_type, media_path, payload, criado_em",
        50,
        tenantId
      ),
      safeQuery<NpsRow>(
        client,
        "nps_respostas",
        "id, tenant_id, cliente_id, atendimento_id, agendamento_id, nota, comentario, criado_em, enviada_em, respondida_em",
        50,
        tenantId
      ),
      safeQuery<PagbankAlertRow>(
        client,
        "pagbank_alertas",
        "id, type, reference_id, order_id, charge_id, status, payload, notified_at, notify_channel, created_at",
        20,
        tenantId
      ),
      safeQuery<PagbankEventRow>(
        client,
        "pagbank_eventos",
        "id, order_id, reference_id, charge_id, status, payload, source, created_at",
        50,
        tenantId
      ),
    ]);

  return {
    clientes,
    especialistas,
    agendamentos,
    cobrancas,
    atendimentos,
    conexoes,
    eventos,
    npsRespostas,
    pagbankAlertas,
    pagbankEventos,
  };
}

export async function createClient(input: {
  nome: string;
  telefone: string;
  email?: string;
  tax_id?: string;
  status?: string;
}) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase nao configurado no frontend.");
  }
  const tenant_id = await getActiveTenantId(client);
  if (!tenant_id) {
    throw new Error("Usuario sem vinculo de clinica (tenant). Faca login novamente.");
  }
  const { data, error } = await client
    .from("clientes")
    .insert({
      nome: input.nome,
      telefone: input.telefone,
      email: input.email ?? null,
      tax_id: input.tax_id ?? null,
      status: input.status ?? "Novo",
      tenant_id,
    })
    .select("id, nome, telefone, email, tax_id, status")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data as ClientRow;
}

export async function updateClient(
  id: string,
  input: {
    nome: string;
    telefone: string;
    email?: string;
    tax_id?: string;
    status: string;
  }
) {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("clientes")
    .update({
      nome: input.nome,
      telefone: input.telefone,
      email: input.email ?? null,
      tax_id: input.tax_id ?? null,
      status: input.status,
    })
    .eq("id", id)
    .select("id, nome, telefone, email, tax_id, status")
    .single();
  if (error) return null;
  return data as ClientRow;
}

export async function createSpecialist(input: { nome: string; especialidade: string; ativo?: boolean }) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase nao configurado no frontend.");
  }
  const tenant_id = await getActiveTenantId(client);
  if (!tenant_id) {
    throw new Error("Usuario sem vinculo de clinica (tenant). Faca login novamente.");
  }
  const { data, error } = await client
    .from("especialistas")
    .insert({
      nome: input.nome,
      especialidade: input.especialidade,
      ativo: input.ativo ?? true,
      tenant_id,
    })
    .select("id, nome, especialidade, ativo")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data as SpecialistRow;
}

export async function updateSpecialist(id: string, input: { nome: string; especialidade: string; ativo: boolean }) {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("especialistas")
    .update({ nome: input.nome, especialidade: input.especialidade, ativo: input.ativo })
    .eq("id", id)
    .select("id, nome, especialidade, ativo")
    .single();
  if (error) return null;
  return data as SpecialistRow;
}

export async function createAppointment(input: {
  cliente_id: string;
  especialista_id: string;
  data_hora: string;
  status: string;
}) {
  const client = getSupabaseClient();
  if (!client) return null;
  const tenant_id = await getActiveTenantId(client);
  if (!tenant_id) return null;
  const { data, error } = await client
    .from("agendamentos")
    .insert({ ...input, tenant_id })
    .select("id, cliente_id, especialista_id, data_hora, status")
    .single();
  if (error) return null;
  return data as AppointmentRow;
}

export async function updateAppointment(id: string, input: {
  cliente_id: string;
  especialista_id: string;
  data_hora: string;
  status: string;
}) {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("agendamentos")
    .update(input)
    .eq("id", id)
    .select("id, cliente_id, especialista_id, data_hora, status")
    .single();
  if (error) return null;
  return data as AppointmentRow;
}

export async function createPayment(input: {
  cliente_id: string;
  valor: number;
  status: string;
}) {
  const client = getSupabaseClient();
  if (!client) return null;
  const tenant_id = await getActiveTenantId(client);
  if (!tenant_id) return null;
  const { data, error } = await client
    .from("cobrancas")
    .insert({ ...input, tenant_id })
    .select(
      "id, cliente_id, valor, status, pagbank_order_id, pagbank_reference_id, pagbank_qr_code_text, pagbank_qr_code_image_url, pagbank_status, pagbank_charge_id, pagbank_payload, pagbank_updated_at, pagbank_expires_at, pagbank_fee, pagbank_net_amount"
    )
    .single();
  if (error) return null;
  return data as PaymentRow;
}

export async function updatePayment(id: string, input: { cliente_id: string; valor: number; status: string }) {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("cobrancas")
    .update(input)
    .eq("id", id)
    .select(
      "id, cliente_id, valor, status, pagbank_order_id, pagbank_reference_id, pagbank_qr_code_text, pagbank_qr_code_image_url, pagbank_status, pagbank_charge_id, pagbank_payload, pagbank_updated_at, pagbank_expires_at, pagbank_fee, pagbank_net_amount"
    )
    .single();
  if (error) return null;
  return data as PaymentRow;
}

export async function updatePaymentPagbank(
  id: string,
  input: Partial<Pick<
    PaymentRow,
    | "pagbank_order_id"
    | "pagbank_reference_id"
    | "pagbank_qr_code_text"
    | "pagbank_qr_code_image_url"
    | "pagbank_status"
    | "pagbank_charge_id"
    | "pagbank_payload"
    | "pagbank_updated_at"
    | "pagbank_expires_at"
    | "pagbank_fee"
    | "pagbank_net_amount"
  >>
) {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("cobrancas")
    .update(input)
    .eq("id", id)
    .select(
      "id, cliente_id, valor, status, pagbank_order_id, pagbank_reference_id, pagbank_qr_code_text, pagbank_qr_code_image_url, pagbank_status, pagbank_charge_id, pagbank_payload, pagbank_updated_at, pagbank_expires_at, pagbank_fee, pagbank_net_amount"
    )
    .single();
  if (error) return null;
  return data as PaymentRow;
}

export async function createAtendimento(input: {
  cliente_id: string | null;
  status: string;
  canal?: string | null;
  responsavel?: string | null;
}) {
  const client = getSupabaseClient();
  if (!client) return null;
  const tenant_id = await getActiveTenantId(client);
  if (!tenant_id) return null;
  const { data, error } = await client
    .from("atendimentos")
    .insert({
      cliente_id: input.cliente_id,
      status: input.status,
      canal: input.canal ?? null,
      responsavel: input.responsavel ?? null,
      tenant_id,
    })
    .select("id, cliente_id, status, canal, responsavel")
    .single();
  if (error) return null;
  return data as AtendimentoRow;
}

export async function updateAtendimentoStatus(id: string, status: string) {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("atendimentos")
    .update({ status })
    .eq("id", id)
    .select("id, cliente_id, status, canal, responsavel")
    .single();
  if (error) return null;
  return data as AtendimentoRow;
}

export async function fetchEvolutionConnections() {
  const client = getSupabaseClient();
  const tenantId = await getActiveTenantId(client);
  return safeQuery<EvolutionConnectionRow>(
    client,
    "evolution_conexoes",
    "id, nome, telefone, instance_id, api_url, ativo, criado_em",
    30,
    tenantId
  );
}

export async function createEvolutionConnection(input: {
  nome: string;
  telefone: string;
  instance_id: string;
  api_url: string;
  ativo?: boolean;
}) {
  const client = getSupabaseClient();
  if (!client) return null;
  const tenant_id = await getActiveTenantId(client);
  if (!tenant_id) return null;
  const { data: existing } = await client
    .from("evolution_conexoes")
    .select("id")
    .eq("tenant_id", tenant_id)
    .or(`telefone.eq.${input.telefone},instance_id.eq.${input.instance_id}`)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return null;
  const { data, error } = await client
    .from("evolution_conexoes")
    .insert({
      nome: input.nome,
      telefone: input.telefone,
      instance_id: input.instance_id,
      api_url: input.api_url,
      ativo: input.ativo ?? true,
      tenant_id,
    })
    .select("id, nome, telefone, instance_id, api_url, ativo, criado_em")
    .single();
  if (error) return null;
  return data as EvolutionConnectionRow;
}

export async function updateEvolutionConnection(
  id: string,
  input: { nome: string; telefone: string; instance_id: string; api_url: string; ativo?: boolean }
) {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("evolution_conexoes")
    .update({
      nome: input.nome,
      telefone: input.telefone,
      instance_id: input.instance_id,
      api_url: input.api_url,
      ativo: input.ativo ?? true,
    })
    .eq("id", id)
    .select("id, nome, telefone, instance_id, api_url, ativo, criado_em")
    .single();
  if (error) return null;
  return data as EvolutionConnectionRow;
}

export async function updateTenant(
  id: string,
  input: { nome: string; nome_real?: string; cnpj?: string }
) {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("tenants")
    .update({
      nome: input.nome,
      nome_real: input.nome_real ?? undefined,
      cnpj: input.cnpj ?? undefined,
    })
    .eq("id", id)
    .select("id, nome, nome_real, cnpj, slug, ativo, criado_em")
    .single();
  if (error) return null;
  return data as TenantRow;
}

export async function fetchEvolutionEvents() {
  const client = getSupabaseClient();
  const tenantId = await getActiveTenantId(client);
  return safeQuery<EvolutionEventRow>(
    client,
    "evolution_eventos",
    "id, event, instance_id, media_url, media_mime, media_type, media_path, payload, criado_em",
    50,
    tenantId
  );
}

export async function fetchSolaraStatus() {
  const client = getSupabaseClient();
  const tenantId = await getActiveTenantId(client);
  if (!client || !tenantId) return null;
  const { data, error } = await client
    .from("solara_status")
    .select("id, tenant_id, status, updated_at")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as SolaraStatusRow;
}

export async function fetchSolaraAutomationSettings() {
  const client = getSupabaseClient();
  const tenantId = await getActiveTenantId(client);
  if (!client || !tenantId) return null;
  const { data, error } = await client
    .from("solara_automation_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data as SolaraAutomationSettingsRow;
}

export async function upsertSolaraAutomationSettings(
  input: Partial<SolaraAutomationSettingsRow>
) {
  const client = getSupabaseClient();
  const tenantId = await getActiveTenantId(client);
  if (!client || !tenantId) return null;
  const { data, error } = await client
    .from("solara_automation_settings")
    .upsert(
      { tenant_id: tenantId, ...input, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" }
    )
    .select("*")
    .single();
  if (error) return null;
  return data as SolaraAutomationSettingsRow;
}

export async function upsertSolaraStatus(status: "ai" | "human") {
  const client = getSupabaseClient();
  const tenantId = await getActiveTenantId(client);
  if (!client || !tenantId) return null;
  const { data, error } = await client
    .from("solara_status")
    .upsert({ tenant_id: tenantId, status, updated_at: new Date().toISOString() })
    .select("id, tenant_id, status, updated_at")
    .single();
  if (error) return null;
  return data as SolaraStatusRow;
}
