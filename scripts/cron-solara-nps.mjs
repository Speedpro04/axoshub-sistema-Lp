import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const evoKey = process.env.EVOLUTION_API_KEY;
const evoBase = process.env.EVOLUTION_API_URL;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (process.env.SOLARA_AUTOMATIONS_ENABLED === "false") {
  console.log(JSON.stringify({ skipped: true, reason: "SOLARA_AUTOMATIONS_ENABLED=false" }));
  process.exit(0);
}

if (process.env.SOLARA_NPS_ENABLED === "false") {
  console.log(JSON.stringify({ skipped: true, reason: "SOLARA_NPS_ENABLED=false" }));
  process.exit(0);
}

if (!evoKey) {
  console.error("Missing EVOLUTION_API_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const now = Date.now();
const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
const twentyFourAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

const renderMessage = (template, data) => {
  return String(template)
    .replace(/\{cliente\}/gi, data.cliente ?? "")
    .replace(/\{clinica\}/gi, data.clinica ?? "")
    .replace(/\{ano\}/gi, String(new Date().getFullYear()));
};

const { data: agendamentos, error: agendamentoError } = await supabase
  .from("agendamentos")
  .select("id, tenant_id, cliente_id, data_hora, status")
  .gte("data_hora", twentyFourAgo)
  .lte("data_hora", twoHoursAgo)
  .in("status", ["Concluido", "Concluído"]);

if (agendamentoError) {
  console.error("Failed to load agendamentos:", agendamentoError.message);
  process.exit(1);
}

if (!agendamentos || agendamentos.length === 0) {
  console.log(JSON.stringify({ sent: 0 }));
  process.exit(0);
}

const agendamentoIds = agendamentos.map((item) => item.id);
const { data: existingNps } = await supabase
  .from("nps_respostas")
  .select("agendamento_id")
  .in("agendamento_id", agendamentoIds);
const npsSet = new Set((existingNps ?? []).map((row) => row.agendamento_id));

const clientesIds = Array.from(
  new Set(agendamentos.map((item) => item.cliente_id).filter(Boolean))
);
const { data: clientes } =
  clientesIds.length > 0
    ? await supabase
        .from("clientes")
        .select("id, nome, telefone, data_ultima_consulta")
        .in("id", clientesIds)
    : { data: [] };

const tenantIds = Array.from(new Set(agendamentos.map((item) => item.tenant_id)));
const { data: tenants } =
  tenantIds.length > 0
    ? await supabase.from("tenants").select("id, nome").in("id", tenantIds)
    : { data: [] };

const { data: conexoes } =
  tenantIds.length > 0
    ? await supabase
        .from("evolution_conexoes")
        .select("tenant_id, instance_id, api_url, ativo")
        .in("tenant_id", tenantIds)
        .eq("ativo", true)
    : { data: [] };

const { data: settingsRows } =
  tenantIds.length > 0
    ? await supabase
        .from("solara_automation_settings")
        .select("tenant_id, nps_enabled, nps_message")
        .in("tenant_id", tenantIds)
    : { data: [] };

const tenantMap = Object.fromEntries(
  (tenants ?? []).map((tenant) => [tenant.id, tenant.nome])
);
const clientMap = Object.fromEntries(
  (clientes ?? []).map((client) => [client.id, client])
);
const conexaoMap = Object.fromEntries(
  (conexoes ?? []).map((conexao) => [conexao.tenant_id, conexao])
);
const settingsMap = Object.fromEntries(
  (settingsRows ?? []).map((row) => [row.tenant_id, row])
);

let sent = 0;

for (const agendamento of agendamentos) {
  if (!agendamento.id || npsSet.has(agendamento.id)) continue;
  const client = clientMap[agendamento.cliente_id ?? ""];
  if (!client?.telefone) continue;

  const conexao = conexaoMap[agendamento.tenant_id ?? ""];
  const apiUrl = conexao?.api_url ?? evoBase;
  if (!apiUrl || !conexao?.instance_id) continue;

  const clinica = tenantMap[agendamento.tenant_id ?? ""] ?? "sua clinica";
  const settings = settingsMap[agendamento.tenant_id ?? ""] ?? null;
  if (settings?.nps_enabled === false) continue;
  const template =
    settings?.nps_message ??
    "Oi {cliente}! Em uma escala de 0 a 10, o quanto voce recomendaria a {clinica}?";
  const message = renderMessage(template, {
    cliente: client.nome ?? "",
    clinica,
  });

  const response = await fetch(
    `${apiUrl.replace(/\/+$/, "")}/message/sendText/${conexao.instance_id}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey,
      },
      body: JSON.stringify({
        number: String(client.telefone).replace(/\D/g, ""),
        text: message,
      }),
    }
  );

  if (!response.ok) continue;

  await supabase.from("nps_respostas").insert({
    tenant_id: agendamento.tenant_id,
    cliente_id: agendamento.cliente_id,
    agendamento_id: agendamento.id,
    nota: null,
    comentario: null,
    enviada_em: new Date().toISOString(),
  });

  if (agendamento.data_hora && client.id) {
    const lastDate = client.data_ultima_consulta
      ? new Date(client.data_ultima_consulta)
      : null;
    const agDate = new Date(agendamento.data_hora);
    if (!lastDate || agDate > lastDate) {
      await supabase
        .from("clientes")
        .update({ data_ultima_consulta: agDate.toISOString().slice(0, 10) })
        .eq("id", client.id);
    }
  }

  sent += 1;
}

console.log(JSON.stringify({ sent }));
