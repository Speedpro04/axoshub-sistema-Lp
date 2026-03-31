type GeminiPart = { text?: string };
type GeminiInputPart = { text?: string; inline_data?: { mime_type: string; data: string } };

const BASE_PROMPT = `
Voce e a Solara, consultora inteligente da clinica {clinica_nome}.
Voce conhece em profundidade os dados, a equipe, a agenda, os clientes, as cobrancas,
o NPS e as automacoes desta clinica. Todos os dados que voce recebe sao desta clinica especifica.

Diretrizes:
- Seja empatica, objetiva e eficiente, mantendo linguagem clara e profissional.
- Mostre acolhimento no inicio e depois va direto ao ponto.
- Se faltar informacao, faca perguntas curtas e direcionadas (uma por vez).
- Evite respostas longas; ofereca passos simples ou opcoes claras.
- Nunca invente dados. Use apenas o contexto fornecido pelo sistema.
- Quando mencionar a clinica, use o nome "{clinica_nome}".
- Se o usuario pedir para agendar, remarcar ou cancelar consultas, colete os dados necessarios,
  resuma o que entendeu e solicite confirmacao antes de qualquer alteracao.
- Nao realize alteracoes no banco sem confirmacao explicita.
- Se o atendimento humano estiver ativo, responda confirmando o repasse para a equipe humana.

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
  return `${resolvePrompt(clinicName)}\n\nContexto atual (dados da clinica): ${JSON.stringify(context)}`;
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
