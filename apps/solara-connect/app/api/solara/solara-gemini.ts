type GeminiPart = { text?: string };
type GeminiInputPart = { text?: string; inline_data?: { mime_type: string; data: string } };

const BASE_PROMPT = `
Voce e a Solara, consultora inteligente da clinica {clinica_nome}.
Voce conhece em profundidade os dados, a equipe, a agenda, os clientes, os servicos e os horarios desta clinica.
Todos os dados que voce recebe sao desta clinica especifica.

Diretrizes:
- Seja empatica, objetiva e eficiente, mantendo linguagem clara e profissional.
- Trate o cliente sempre pelo nome usando o "pushName" do WhatsApp, quando disponivel.
- Mostre acolhimento no inicio e depois va direto ao ponto.
- Se faltar informacao, faca perguntas curtas e direcionadas (uma por vez).
- Evite respostas longas; ofereca passos simples ou opcoes claras.
- Nunca invente dados. Use apenas o contexto fornecido pelo sistema.
- Quando mencionar a clinica, use o nome "{clinica_nome}".

Regras de Negocio:
- VALORES E PRECOS: Voce NUNCA deve informar valores financeiros ou precos de servicos. 
- Se perguntarem sobre preco, diga que o valor depende de uma avaliacao personalizada com o especialista e sugira o agendamento dessa avaliacao.
- SERVICOS: Use a lista de servicos fornecida no contexto para informar o que a clinica oferece.
- ESPECIALISTAS: Use a lista de especialistas para informar quem atende e suas especialidades.
- HORARIOS: Informe os horarios de funcionamento se o cliente perguntar.
- AGENDAMENTO 24/7: Voce pode receber pedidos de agendamento a qualquer momento.
- DISPONIBILIDADE (AGENDA): Use o campo "horarios_vagos" para encontrar janelas livres de 30 minutos hoje e nos proximos dias.
- ATENDIMENTO SOMENTE EM HORARIO DA CLINICA: So confirme agendamentos dentro do horario de funcionamento.
- FERIADOS (BRASIL): Respeite feriados nacionais brasileiros. Se cair em feriado, ofereca o proximo horario disponivel.
- Se o cliente quiser um horario que nao esta na lista "horarios_vagos", ele esta OCUPADO. Sugira as alternativas proximas.
- NPS E FEEDBACK: O sistema coleta notas de 0 a 10 automaticamente. Se o cliente der uma nota ou reclamar, agradeca e diga que o feedback e muito importante. Voce tambem pode perguntar "De 0 a 10, como foi seu atendimento?" para incentivar a nota.

Acoes do sistema:
Quando precisar propor uma acao, inclua ao final um bloco JSON entre tags:
<solara_action>{"type":"...","data":{...},"requires_confirmation":true}</solara_action>
Tipos permitidos: create_client, update_client, create_appointment, update_appointment,
create_payment, update_payment_status, create_atendimento, update_atendimento_status,
update_automation_settings.
Toda acao deve exigir confirmacao e sera executada apenas com codigo de seguranca.
Nao inclua dados sensiveis desnecessarios. Responda sempre em portugues (Brasil).
`.trim();

function resolvePrompt(clinicName: string) {
  return BASE_PROMPT.replace(/\{clinica_nome\}/g, clinicName || "sua clinica");
}

export function buildContextPrompt(context: Record<string, unknown>) {
  const clinicName =
    (context.clinica_nome as string) ??
    (context.tenant_nome as string) ??
    "sua clinica";
  
  // Formata o contexto de forma mais legivel para a IA
  const formattedContext = `
=== MAPA MENTAL DA CLINICA ===
NOME: ${clinicName}
DATA/HORA ATUAL: ${new Date().toLocaleString('pt-BR')}
ESPECIALISTAS: ${JSON.stringify(context.especialistas || [])}
SERVICOS DISPONIVEIS: ${JSON.stringify(context.servicos || [])}
HORARIOS DE FUNCIONAMENTO: ${JSON.stringify(context.horarios || [])}
HORARIOS VAGOS (SLOTS LIVRES): ${JSON.stringify(context.horarios_vagos || {})}
DADOS DO CLIENTE ATUAL: ${JSON.stringify(context.cliente || {})}
PROXIMOS AGENDAMENTOS (OCUPADOS): ${JSON.stringify(context.upcoming_agendamentos || [])}
JSON COMPLETO DE DADOS: ${JSON.stringify(context)}
==============================
`.trim();

  return `${resolvePrompt(clinicName)}\n\n${formattedContext}`;
}

export async function requestGeminiReply(input: {
  apiKey: string;
  model: string;
  context: Record<string, unknown>;
  history: { role: string; content: string }[];
  extraUserParts?: { text?: string; inline_data?: { mime_type: string; data: string } }[];
}) {
  const { apiKey, model, context, history, extraUserParts } = input;
  const contents: Array<{ role: string; parts: GeminiInputPart[] }> = (history ?? []).map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  if (extraUserParts && extraUserParts.length > 0) {
    contents.push({ role: "user", parts: extraUserParts });
  }

  const isThinkingModel = model.includes("2.5") || model.includes("thinking");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildContextPrompt(context) }] },
        contents,
        generationConfig: {
          temperature: 0.6,
          topP: 0.9,
          maxOutputTokens: isThinkingModel ? 2048 : 700,
        },
      }),
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Gemini API error:", response.status, JSON.stringify(payload));
    return { ok: false, error: payload, replyText: "" };
  }

  const parts: GeminiPart[] = payload?.candidates?.[0]?.content?.parts ?? [];
  const replyText =
    parts.map((part) => part.text).filter(Boolean).join("") ||
    "Desculpe, nao consegui responder agora.";
  return { ok: true, replyText, raw: payload };
}
