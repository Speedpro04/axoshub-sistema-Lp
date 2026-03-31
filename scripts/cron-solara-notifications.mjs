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

if (!evoKey) {
  console.error("Missing EVOLUTION_API_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const now = new Date();
const today = now.toISOString().slice(0, 10);
const todayMonthDay = today.slice(5);

const renderMessage = (template, data) => {
  return String(template)
    .replace(/\{cliente\}/gi, data.cliente ?? "")
    .replace(/\{clinica\}/gi, data.clinica ?? "")
    .replace(/\{ano\}/gi, String(new Date().getFullYear()));
};

const { data: tenants } = await supabase.from("tenants").select("id, nome");
const { data: conexoes } = await supabase
  .from("evolution_conexoes")
  .select("tenant_id, instance_id, api_url, ativo")
  .eq("ativo", true);

const { data: settingsRows } = await supabase
  .from("solara_automation_settings")
  .select(
    "tenant_id, birthday_enabled, birthday_message, christmas_enabled, christmas_message, newyear_enabled, newyear_message, followup_7d_enabled, followup_7d_message, followup_11m_enabled, followup_11m_message"
  );

const tenantMap = Object.fromEntries((tenants ?? []).map((tenant) => [tenant.id, tenant]));
const conexaoMap = Object.fromEntries((conexoes ?? []).map((row) => [row.tenant_id, row]));
const settingsMap = Object.fromEntries(
  (settingsRows ?? []).map((row) => [row.tenant_id, row])
);

const { data: clientes } = await supabase
  .from("clientes")
  .select("id, tenant_id, nome, telefone, data_nascimento, data_ultima_consulta")
  .not("telefone", "is", null);

const clienteIds = Array.from(new Set((clientes ?? []).map((cliente) => cliente.id)));
const logsQuery =
  clienteIds.length > 0
    ? await supabase
        .from("solara_automation_logs")
        .select("tenant_id, cliente_id, tipo, referencia_data")
        .in("cliente_id", clienteIds)
    : { data: [] };

const sentSet = new Set(
  (logsQuery.data ?? []).map(
    (row) => `${row.tenant_id}|${row.cliente_id}|${row.tipo}|${row.referencia_data}`
  )
);

const sendText = async (tenantId, phone, text) => {
  const conexao = conexaoMap[tenantId];
  const apiUrl = conexao?.api_url ?? evoBase;
  if (!apiUrl || !conexao?.instance_id) return false;
  const response = await fetch(
    `${apiUrl.replace(/\/+$/, "")}/message/sendText/${conexao.instance_id}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey,
      },
      body: JSON.stringify({
        number: String(phone).replace(/\D/g, ""),
        text,
      }),
    }
  );
  return response.ok;
};

let sent = 0;

for (const cliente of clientes ?? []) {
  const tenant = tenantMap[cliente.tenant_id ?? ""];
  if (!tenant) continue;
  const phone = cliente.telefone;
  if (!phone) continue;
  const settings = settingsMap[cliente.tenant_id ?? ""] ?? {};

  if (cliente.data_nascimento) {
    const birthDay = String(cliente.data_nascimento).slice(5);
    if (birthDay === todayMonthDay) {
      const key = `${cliente.tenant_id}|${cliente.id}|aniversario|${today}`;
      if (!sentSet.has(key)) {
        if (settings.birthday_enabled === false) continue;
        const template =
          settings.birthday_message ??
          "Feliz aniversario, {cliente}! A {clinica} deseja um dia especial.";
        const ok = await sendText(
          cliente.tenant_id,
          phone,
          renderMessage(template, {
            cliente: cliente.nome ?? "",
            clinica: tenant.nome ?? "",
          })
        );
        if (ok) {
          await supabase.from("solara_automation_logs").insert({
            tenant_id: cliente.tenant_id,
            cliente_id: cliente.id,
            tipo: "aniversario",
            referencia_data: today,
            metadata: { tipo: "aniversario" },
          });
          sent += 1;
        }
      }
    }
  }

  const monthDay = todayMonthDay;
  if (monthDay === "12-25") {
    const key = `${cliente.tenant_id}|${cliente.id}|natal|${today}`;
    if (!sentSet.has(key)) {
      if (settings.christmas_enabled === false) continue;
      const template =
        settings.christmas_message ??
        "A {clinica} deseja um Feliz Natal e um otimo fim de ano!";
      const ok = await sendText(
        cliente.tenant_id,
        phone,
        renderMessage(template, { cliente: cliente.nome ?? "", clinica: tenant.nome ?? "" })
      );
      if (ok) {
        await supabase.from("solara_automation_logs").insert({
          tenant_id: cliente.tenant_id,
          cliente_id: cliente.id,
          tipo: "natal",
          referencia_data: today,
          metadata: { tipo: "natal" },
        });
        sent += 1;
      }
    }
  }

  if (monthDay === "01-01") {
    const key = `${cliente.tenant_id}|${cliente.id}|ano_novo|${today}`;
    if (!sentSet.has(key)) {
      if (settings.newyear_enabled === false) continue;
      const template =
        settings.newyear_message ??
        "A {clinica} deseja um Feliz Ano Novo! Conte com a gente em {ano}.";
      const ok = await sendText(
        cliente.tenant_id,
        phone,
        renderMessage(template, { cliente: cliente.nome ?? "", clinica: tenant.nome ?? "" })
      );
      if (ok) {
        await supabase.from("solara_automation_logs").insert({
          tenant_id: cliente.tenant_id,
          cliente_id: cliente.id,
          tipo: "ano_novo",
          referencia_data: today,
          metadata: { tipo: "ano_novo" },
        });
        sent += 1;
      }
    }
  }

  if (cliente.data_ultima_consulta) {
    const last = new Date(cliente.data_ultima_consulta);
    const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));

    if (diffDays >= 335 && diffDays <= 365) {
      const refDate = cliente.data_ultima_consulta;
      const key = `${cliente.tenant_id}|${cliente.id}|followup_11m|${refDate}`;
      if (!sentSet.has(key)) {
        if (settings.followup_11m_enabled === false) continue;
        const template =
          settings.followup_11m_message ??
          "Oi {cliente}, ja faz quase um ano da sua ultima consulta. Deseja agendar um retorno?";
        const ok = await sendText(
          cliente.tenant_id,
          phone,
          renderMessage(template, {
            cliente: cliente.nome ?? "",
            clinica: tenant.nome ?? "",
          })
        );
        if (ok) {
          await supabase.from("solara_automation_logs").insert({
            tenant_id: cliente.tenant_id,
            cliente_id: cliente.id,
            tipo: "followup_11m",
            referencia_data: refDate,
            metadata: { tipo: "followup_11m", diffDays },
          });
          sent += 1;
        }
      }
    }

    if (diffDays >= 7 && diffDays <= 8) {
      const refDate = cliente.data_ultima_consulta;
      const key = `${cliente.tenant_id}|${cliente.id}|followup_7d|${refDate}`;
      if (!sentSet.has(key)) {
        if (settings.followup_7d_enabled === false) continue;
        const template =
          settings.followup_7d_message ??
          "Oi {cliente}! Como voce esta apos a consulta? Posso ajudar em algo?";
        const ok = await sendText(
          cliente.tenant_id,
          phone,
          renderMessage(template, {
            cliente: cliente.nome ?? "",
            clinica: tenant.nome ?? "",
          })
        );
        if (ok) {
          await supabase.from("solara_automation_logs").insert({
            tenant_id: cliente.tenant_id,
            cliente_id: cliente.id,
            tipo: "followup_7d",
            referencia_data: refDate,
            metadata: { tipo: "followup_7d", diffDays },
          });
          sent += 1;
        }
      }
    }
  }
}

console.log(JSON.stringify({ sent }));
