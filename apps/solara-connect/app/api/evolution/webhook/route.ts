import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { requestGeminiReply } from "../../solara/solara-gemini";

export const runtime = "nodejs";
const BRAZIL_TZ = "America/Sao_Paulo";

type EvolutionWebhookPayload = {
  event?: string;
  instance?: string;
  data?: unknown;
};

type MediaInfo = {
  url?: string | null;
  mime?: string | null;
  type?: string | null;
};

type MessageInfo = {
  remoteJid: string | null;
  text: string | null;
  fromMe: boolean;
  pushName?: string | null;
  isGroup: boolean;
  mediaKind?: string | null;
};

type ScheduleIntent =
  | { kind: "none" }
  | { kind: "invalid_format" }
  | {
      kind: "create_appointment";
      dateTimeIso: string;
      specialistHint: string | null;
    };

function isAuthorized(request: Request) {
  const token = process.env.EVOLUTION_WEBHOOK_TOKEN;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!token) return true;

  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const apiKeyHeader =
    request.headers.get("apikey") ??
    request.headers.get("x-api-key") ??
    request.headers.get("x-evolution-api-key") ??
    "";

  return token === bearer || token === apiKeyHeader || apiKey === bearer || apiKey === apiKeyHeader;
}

async function verifySignature(request: Request, rawBody: string) {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!secret) return true;
  const signature =
    request.headers.get("x-evolution-signature") ??
    request.headers.get("x-hub-signature-256") ??
    "";
  if (!signature) return false;
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;
  return signature === expected;
}

function detectMediaType(mime?: string | null, key?: string | null) {
  const candidate = (mime ?? key ?? "").toLowerCase();
  if (candidate.includes("image")) return "image";
  if (candidate.includes("audio")) return "audio";
  if (candidate.includes("video")) return "video";
  if (candidate.includes("document") || candidate.includes("application")) return "document";
  return null;
}

function normalizePhone(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function parsePtBrDateTimeToIso(datePart: string, timePart: string) {
  const dateMatch = datePart.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    year < 2020 ||
    year > 2100 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const utc = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0));
  if (Number.isNaN(utc.getTime())) return null;
  return utc.toISOString();
}

function detectScheduleIntent(text: string): ScheduleIntent {
  const normalized = text.toLowerCase();
  const wantsSchedule =
    normalized.includes("agendar") ||
    normalized.includes("marcar consulta") ||
    normalized.includes("marcar horario") ||
    normalized.includes("marcar horário");
  if (!wantsSchedule) return { kind: "none" };

  const dateMatch = text.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\b/);
  const timeMatch = text.match(/\b(\d{1,2}:\d{2})\b/);
  if (!dateMatch || !timeMatch) {
    return { kind: "invalid_format" };
  }

  const iso = parsePtBrDateTimeToIso(dateMatch[1], timeMatch[1]);
  if (!iso) {
    return { kind: "invalid_format" };
  }

  const specialistMatch =
    text.match(/especialista\s*[:\-]\s*([^\n\r,;]+)/i) ??
    text.match(/\bcom\s+([^\n\r,;]+)$/i);
  const specialistHint = specialistMatch?.[1]?.trim() ?? null;

  return { kind: "create_appointment", dateTimeIso: iso, specialistHint };
}

function extractTextFromMessage(message: Record<string, unknown>) {
  const text =
    (message["conversation"] as string | undefined) ||
    ((message["extendedTextMessage"] as Record<string, unknown> | undefined)?.["text"] as
      | string
      | undefined) ||
    ((message["imageMessage"] as Record<string, unknown> | undefined)?.["caption"] as
      | string
      | undefined) ||
    ((message["videoMessage"] as Record<string, unknown> | undefined)?.["caption"] as
      | string
      | undefined) ||
    ((message["documentMessage"] as Record<string, unknown> | undefined)?.["caption"] as
      | string
      | undefined) ||
    ((message["buttonsResponseMessage"] as Record<string, unknown> | undefined)
      ?.["selectedDisplayText"] as string | undefined) ||
    ((message["listResponseMessage"] as Record<string, unknown> | undefined)?.["title"] as
      | string
      | undefined);
  return text ?? null;
}

function detectMediaKind(message: Record<string, unknown>) {
  if (message["imageMessage"]) return "image";
  if (message["audioMessage"]) return "audio";
  if (message["videoMessage"]) return "video";
  if (message["documentMessage"]) return "document";
  return null;
}

function extractMessageInfo(payload: EvolutionWebhookPayload): MessageInfo | null {
  const raw = (payload as Record<string, unknown>)?.data ?? payload;
  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;

  const key =
    (record["key"] as Record<string, unknown> | undefined) ??
    ((record["message"] as Record<string, unknown> | undefined)?.["key"] as
      | Record<string, unknown>
      | undefined);

  const message =
    (record["message"] as Record<string, unknown> | undefined) ??
    ((record["messages"] as Record<string, unknown>[] | undefined)?.[0] as
      | Record<string, unknown>
      | undefined) ??
    (record["data"] as Record<string, unknown> | undefined);

  if (!message) return null;

  const remoteJid =
    (key?.["remoteJid"] as string | undefined) ??
    (record["remoteJid"] as string | undefined) ??
    (message["remoteJid"] as string | undefined) ??
    null;

  const fromMe =
    Boolean(key?.["fromMe"]) ||
    Boolean(record["fromMe"]) ||
    Boolean(message["fromMe"]);

  const pushName =
    (record["pushName"] as string | undefined) ??
    (record["pushname"] as string | undefined) ??
    (record["senderName"] as string | undefined) ??
    null;

  const text = extractTextFromMessage(message);
  const mediaKind = detectMediaKind(message);
  const isGroup = remoteJid ? remoteJid.endsWith("@g.us") : false;

  return {
    remoteJid,
    text,
    fromMe,
    pushName,
    isGroup,
    mediaKind,
  };
}

function extractMediaFromObject(value: unknown, hint?: string): MediaInfo | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const url =
    (obj["url"] as string | undefined) ||
    (obj["mediaUrl"] as string | undefined) ||
    (obj["media_url"] as string | undefined);
  const mime =
    (obj["mimetype"] as string | undefined) ||
    (obj["mimeType"] as string | undefined) ||
    (obj["mime"] as string | undefined);
  const base64 =
    (obj["base64"] as string | undefined) ||
    (obj["base64Data"] as string | undefined);

  if (url || base64) {
    const type = detectMediaType(mime, hint ?? "");
    const safeBase64 =
      base64 && base64.length < 300000 ? `data:${mime ?? "application/octet-stream"};base64,${base64}` : null;
    return {
      url: url ?? safeBase64,
      mime: mime ?? null,
      type,
    };
  }
  return null;
}

function deepFindMedia(value: unknown, hint?: string): MediaInfo | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFindMedia(item, hint);
      if (found?.url) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const direct = extractMediaFromObject(value, hint);
    if (direct?.url) return direct;
    const obj = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(obj)) {
      const found = deepFindMedia(item, key);
      if (found?.url) return found;
    }
  }
  return null;
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");
  return { mime, buffer };
}

async function loadInlineMedia(media: MediaInfo | null) {
  if (!media?.url) return null;
  const maxMb = Number(process.env.SOLARA_MEDIA_MAX_MB ?? "5");
  const maxBytes = maxMb * 1024 * 1024;

  if (media.url.startsWith("data:")) {
    const parsed = parseDataUrl(media.url);
    if (!parsed) return null;
    if (parsed.buffer.length > maxBytes) return null;
    return { mime: media.mime ?? parsed.mime, data: parsed.buffer.toString("base64") };
  }

  if (media.url.startsWith("http")) {
    const response = await fetch(media.url);
    const sizeHeader = response.headers.get("content-length");
    if (sizeHeader && Number(sizeHeader) > maxBytes) {
      return null;
    }
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) return null;
    const mime = response.headers.get("content-type") ?? media.mime ?? "application/octet-stream";
    return { mime, data: Buffer.from(arrayBuffer).toString("base64") };
  }

  return null;
}

function extFromMime(mime?: string | null) {
  if (!mime) return "bin";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("pdf")) return "pdf";
  return "bin";
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (!(await verifySignature(request, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = (JSON.parse(rawBody) as EvolutionWebhookPayload | null) ?? null;
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const { event, instance } = payload;
  const media =
    deepFindMedia((payload as Record<string, unknown>)?.data ?? payload, event) ?? null;

  console.log("Evolution webhook received", {
    event,
    instance,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      let tenant_id: string | null = null;
      let conexao:
        | {
            tenant_id: string | null;
            instance_id: string | null;
            api_url: string | null;
            telefone: string | null;
          }
        | null = null;
      if (instance) {
        const { data } = await supabase
          .from("evolution_conexoes")
          .select("tenant_id, instance_id, api_url, telefone")
          .eq("instance_id", instance)
          .limit(1)
          .maybeSingle();
        conexao = data ?? null;
        tenant_id = data?.tenant_id ?? null;
      }

      let clinicaNome = "sua clinica";
      if (tenant_id) {
        const { data: tenantRow } = await supabase
          .from("tenants")
          .select("nome")
          .eq("id", tenant_id)
          .limit(1)
          .maybeSingle();
        clinicaNome = tenantRow?.nome ?? clinicaNome;
      }

      let mediaUrl = media?.url ?? null;
      let mediaPath: string | null = null;
      let mediaMime = media?.mime ?? null;
      let mediaType = media?.type ?? null;

      const storageBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "evolution-media";
      const shouldUpload =
        supabaseKey === process.env.SUPABASE_SERVICE_ROLE_KEY &&
        Boolean(mediaUrl);

      if (shouldUpload && mediaUrl) {
        try {
          let buffer: Buffer | null = null;
          let contentType: string | null = mediaMime ?? null;

          if (mediaUrl.startsWith("data:")) {
            const parsed = parseDataUrl(mediaUrl);
            if (parsed) {
              buffer = parsed.buffer;
              contentType = contentType ?? parsed.mime;
            }
          } else if (mediaUrl.startsWith("http")) {
            const response = await fetch(mediaUrl);
            const sizeHeader = response.headers.get("content-length");
            if (sizeHeader && Number(sizeHeader) > 15_000_000) {
              buffer = null;
            } else if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              buffer = Buffer.from(arrayBuffer);
              contentType = contentType ?? response.headers.get("content-type");
            }
          }

          if (buffer) {
            const extension = extFromMime(contentType);
            const safeTenant = tenant_id ?? "global";
            const safeInstance = instance ?? "unknown";
            const filePath = `${safeTenant}/${safeInstance}/${Date.now()}-${Math.random()
              .toString(36)
              .slice(2)}.${extension}`;
            const { error: uploadError } = await supabase.storage
              .from(storageBucket)
              .upload(filePath, buffer, {
                contentType: contentType ?? "application/octet-stream",
                upsert: false,
              });
            if (!uploadError) {
              mediaPath = filePath;
              mediaUrl = null;
              mediaMime = contentType ?? mediaMime;
              mediaType = detectMediaType(mediaMime, extension) ?? mediaType;
            }
          }
        } catch {
          // keep original media url if upload fails
        }
      }

      await supabase.from("evolution_eventos").insert({
        tenant_id,
        event: event ?? null,
        instance_id: instance ?? null,
        media_url: mediaUrl,
        media_mime: mediaMime,
        media_type: mediaType,
        media_path: mediaPath,
        payload,
      });

      if (tenant_id) {
        const statusQuery = await supabase
          .from("solara_status")
          .select("status")
          .eq("tenant_id", tenant_id)
          .limit(1)
          .maybeSingle();
        const statusRow = statusQuery.data ?? null;
        const status = statusRow?.status ?? "ai";

        const autoReplyEnabled = process.env.SOLARA_AUTO_REPLY === "true";
        const npsEnabled = process.env.SOLARA_NPS_ENABLED !== "false";
        const messageInfo = extractMessageInfo(payload);
        const eventLabel = (event ?? "").toLowerCase();
        const isMessageEvent =
          eventLabel.includes("message") || eventLabel.includes("messages");

        const { data: automationSettings } = await supabase
          .from("solara_automation_settings")
          .select("auto_reply_enabled, nps_enabled")
          .eq("tenant_id", tenant_id)
          .limit(1)
          .maybeSingle();
        const tenantAutoReply = automationSettings?.auto_reply_enabled ?? true;
        const tenantNpsEnabled = automationSettings?.nps_enabled ?? true;

        if (!autoReplyEnabled || !tenantAutoReply || !isMessageEvent || !messageInfo) {
          return NextResponse.json({ ok: true });
        }

        if (status === "human") {
          await supabase.from("evolution_eventos").insert({
            tenant_id,
            event: "solara_handoff",
            instance_id: instance ?? null,
            payload: {
              reason: "human_requested",
              original_event: event ?? null,
            },
          });
          const evoKey = process.env.EVOLUTION_API_KEY ?? "";
          if (
            evoKey &&
            messageInfo?.remoteJid &&
            conexao?.instance_id &&
            conexao?.api_url
          ) {
            await fetch(
              `${conexao.api_url.replace(/\/+$/, "")}/message/sendText/${
                conexao.instance_id
              }`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: evoKey,
                },
                body: JSON.stringify({
                  number: normalizePhone(messageInfo.remoteJid),
                  text: "Um atendente humano foi acionado e continuara o atendimento.",
                }),
              }
            );
          }
          return NextResponse.json({ ok: true, routed: "human" });
        }

        if (!messageInfo.remoteJid || messageInfo.fromMe || messageInfo.isGroup) {
          return NextResponse.json({ ok: true });
        }

        const senderPhone = normalizePhone(messageInfo.remoteJid);
        if (!senderPhone) {
          return NextResponse.json({ ok: true });
        }

        const textContent = (messageInfo.text ?? "").trim();
        if (npsEnabled && tenantNpsEnabled && /^\d{1,2}$/.test(textContent)) {
          const score = Number(textContent);
          if (score >= 0 && score <= 10) {
            const { data: clientes } = await supabase
              .from("clientes")
              .select("id, telefone")
              .eq("tenant_id", tenant_id)
              .limit(2000);
            const matched = (clientes ?? []).find(
              (client) => normalizePhone(client.telefone) === senderPhone
            );
            if (matched?.id) {
              const { data: pending } = await supabase
                .from("nps_respostas")
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("cliente_id", matched.id)
                .is("respondida_em", null)
                .order("enviada_em", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (pending?.id) {
                await supabase
                  .from("nps_respostas")
                  .update({ nota: score, respondida_em: new Date().toISOString() })
                  .eq("id", pending.id);
                const evoKey = process.env.EVOLUTION_API_KEY ?? "";
                if (evoKey && conexao?.instance_id && conexao?.api_url) {
                  await fetch(
                    `${conexao.api_url.replace(/\/+$/, "")}/message/sendText/${
                      conexao.instance_id
                    }`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        apikey: evoKey,
                      },
                      body: JSON.stringify({
                        number: senderPhone,
                        text: "Obrigado pelo seu feedback! Estamos sempre melhorando.",
                      }),
                    }
                  );
                }
                return NextResponse.json({ ok: true, nps: true });
              }
            }
          }
        }

        const { data: clientes } = await supabase
          .from("clientes")
          .select("id, nome, telefone, data_ultima_consulta")
          .eq("tenant_id", tenant_id)
          .limit(2000);
        const existingClient = (clientes ?? []).find(
          (client) => normalizePhone(client.telefone) === senderPhone
        );

        let clientId = existingClient?.id ?? null;
        let clientName = existingClient?.nome ?? null;

        if (!clientId) {
          const { data: createdClient } = await supabase
            .from("clientes")
            .insert({
              tenant_id,
              nome: messageInfo.pushName ?? "Novo cliente",
              telefone: senderPhone,
              status: "Novo",
            })
            .select("id, nome")
            .single();
          clientId = createdClient?.id ?? null;
          clientName = createdClient?.nome ?? null;
        }

        if (clientId) {
          const { data: latestAtendimento } = await supabase
            .from("atendimentos")
            .select("id, criado_em, status")
            .eq("tenant_id", tenant_id)
            .eq("cliente_id", clientId)
            .order("criado_em", { ascending: false })
            .limit(1)
            .maybeSingle();
          const shouldCreateAtendimento =
            !latestAtendimento?.id ||
            ["Concluido", "Concluído", "Cancelado"].includes(
              (latestAtendimento.status ?? "") as string
            );
          if (shouldCreateAtendimento) {
            await supabase.from("atendimentos").insert({
              tenant_id,
              cliente_id: clientId,
              status: "Novo",
              canal: "WhatsApp",
              responsavel: "Solara",
            });
          }
        }

        const source = `evolution:${senderPhone}`;
        const { data: existingThread } = await supabase
          .from("solara_threads")
          .select("id")
          .eq("tenant_id", tenant_id)
          .eq("source", source)
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle();

        let threadId = existingThread?.id ?? null;
        if (!threadId) {
          const { data: newThread } = await supabase
            .from("solara_threads")
            .insert({
              tenant_id,
              user_id: null,
              source,
              channel: "whatsapp",
              external_id: senderPhone,
              status: "open",
            })
            .select("id")
            .single();
          threadId = newThread?.id ?? null;
        }

        if (!threadId) {
          return NextResponse.json({ ok: true });
        }

        await supabase.from("solara_messages").insert({
          thread_id: threadId,
          role: "user",
          content:
            textContent ||
            (messageInfo.mediaKind
              ? `Midia recebida (${messageInfo.mediaKind}).`
              : "Mensagem recebida."),
          metadata: {
            channel: "whatsapp",
            remote: senderPhone,
            media: messageInfo.mediaKind ?? null,
          },
        });

        const scheduleIntent = detectScheduleIntent(textContent);
        if (scheduleIntent.kind !== "none") {
          const evoKey = process.env.EVOLUTION_API_KEY ?? "";
          if (!evoKey || !conexao?.instance_id || !conexao?.api_url) {
            return NextResponse.json({ ok: true });
          }

          let replyText = "";
          if (scheduleIntent.kind === "invalid_format") {
            replyText =
              "Para agendar, me envie assim: AGENDAR 31/03/2026 14:30 especialista: Dra. Tania";
          } else {
            const { data: specialists } = await supabase
              .from("especialistas")
              .select("id, nome, especialidade, ativo")
              .eq("tenant_id", tenant_id)
              .eq("ativo", true)
              .limit(200);

            const normalizedHint = (scheduleIntent.specialistHint ?? "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
            const normalizeName = (value: string) =>
              value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            let selectedSpecialist =
              (specialists ?? []).find((item) =>
                normalizedHint ? normalizeName(item.nome).includes(normalizedHint) : false
              ) ?? null;

            if (!selectedSpecialist && (specialists?.length ?? 0) === 1) {
              selectedSpecialist = specialists![0];
            }

            if (!selectedSpecialist) {
              const names = (specialists ?? [])
                .slice(0, 5)
                .map((item) => item.nome)
                .join(", ");
              replyText =
                names.length > 0
                  ? `Nao encontrei o especialista. Informe o nome exato. Disponiveis: ${names}.`
                  : "Nao ha especialistas ativos para agendar no momento.";
            } else if (!clientId) {
              replyText =
                "Nao consegui identificar o cliente para agendar. Tente novamente em instantes.";
            } else {
              const { data: conflict } = await supabase
                .from("agendamentos")
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("especialista_id", selectedSpecialist.id)
                .eq("data_hora", scheduleIntent.dateTimeIso)
                .in("status", ["Agendado", "Confirmado", "Em atendimento"])
                .limit(1)
                .maybeSingle();

              if (conflict?.id) {
                replyText =
                  "Esse horario ja esta ocupado. Me envie outro horario no formato DD/MM/AAAA HH:MM.";
              } else {
                const { data: createdAppointment } = await supabase
                  .from("agendamentos")
                  .insert({
                    tenant_id,
                    cliente_id: clientId,
                    especialista_id: selectedSpecialist.id,
                    data_hora: scheduleIntent.dateTimeIso,
                    status: "Agendado",
                  })
                  .select("id, data_hora")
                  .single();

                if (createdAppointment?.id) {
                  const localDate = new Date(createdAppointment.data_hora);
                  const dateText = localDate.toLocaleDateString("pt-BR", {
                    timeZone: BRAZIL_TZ,
                  });
                  const timeText = localDate.toLocaleTimeString("pt-BR", {
                    timeZone: BRAZIL_TZ,
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  replyText = `Consulta agendada com ${selectedSpecialist.nome} para ${dateText} as ${timeText}.`;
                } else {
                  replyText = "Nao consegui salvar o agendamento. Tente novamente.";
                }
              }
            }
          }

          await supabase.from("solara_messages").insert({
            thread_id: threadId,
            role: "assistant",
            content: replyText,
            metadata: { source: "scheduler" },
          });

          await fetch(
            `${conexao.api_url.replace(/\/+$/, "")}/message/sendText/${conexao.instance_id}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: evoKey,
              },
              body: JSON.stringify({
                number: senderPhone,
                text: replyText,
              }),
            }
          );
          return NextResponse.json({ ok: true, scheduler: true });
        }

        const { data: history } = await supabase
          .from("solara_messages")
          .select("role, content, criado_em")
          .eq("thread_id", threadId)
          .order("criado_em", { ascending: true })
          .limit(12);

        const [
          clientesCount,
          especialistasCount,
          agendamentosCount,
          servicosRows,
          horariosRows,
          todosEspecialistasRows,
        ] = await Promise.all([
          supabase
            .from("clientes")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenant_id),
          supabase
            .from("especialistas")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenant_id),
          supabase
            .from("agendamentos")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenant_id),
          supabase
            .from("servicos")
            .select("nome, duracao_minutos, descricao, categoria")
            .eq("tenant_id", tenant_id)
            .eq("ativo", true),
          supabase
            .from("horarios_funcionamento")
            .select("dia_semana, abertura, fechamento")
            .eq("tenant_id", tenant_id),
          supabase
            .from("especialistas")
            .select("nome, especialidade")
            .eq("tenant_id", tenant_id)
            .eq("ativo", true),
        ]);

        const { data: upcoming } = await supabase
          .from("agendamentos")
          .select("id, data_hora, status, cliente_id, especialista_id")
          .eq("tenant_id", tenant_id)
          .gte("data_hora", new Date().toISOString())
          .lte("data_hora", new Date(Date.now() + 172800000).toISOString()) // Proximos 2 dias
          .order("data_hora", { ascending: true });

        // LOGICA DE CALCULO DE HORARIOS VAGOS (30/30)
        const freeSlots: Record<string, string[]> = {};
        if (horariosRows.data && horariosRows.data.length > 0) {
          const now = new Date();
          for (let i = 0; i < 3; i++) { // Hoje, Amanha, Depois
            const day = new Date(now.getTime() + i * 86400000);
            const dayOfWeek = day.getDay();
            const config = (horariosRows.data ?? []).find(h => h.dia_semana === dayOfWeek);
            
            if (config) {
              const dayStr = day.toISOString().split('T')[0];
              freeSlots[dayStr] = [];
              
              const [hOpen, mOpen] = config.abertura.split(':').map(Number);
              const [hClose, mClose] = config.fechamento.split(':').map(Number);
              
              let current = new Date(day);
              current.setHours(hOpen, mOpen, 0, 0);
              const end = new Date(day);
              end.setHours(hClose, mClose, 0, 0);
              
              while (current < end) {
                const slotTime = current.toISOString();
                const isOccupied = (upcoming ?? []).some(a => 
                  new Date(a.data_hora).getTime() === current.getTime() && 
                  a.status !== 'Cancelado'
                );
                
                // Nao sugerir horarios que ja passaram hoje
                if (!isOccupied && current > now) {
              freeSlots[dayStr].push(
                current.toLocaleTimeString("pt-BR", {
                  timeZone: BRAZIL_TZ,
                  hour: "2-digit",
                  minute: "2-digit",
                })
              );
                }
                current.setMinutes(current.getMinutes() + 30);
              }
            }
          }
        }

        const clientIds = new Set(
          (upcoming ?? []).map((item) => item.cliente_id).filter(Boolean)
        );
        const specialistIds = new Set(
          (upcoming ?? []).map((item) => item.especialista_id).filter(Boolean)
        );

        const { data: clientRows } =
          clientIds.size > 0
            ? await supabase
                .from("clientes")
                .select("id, nome, telefone")
                .in("id", Array.from(clientIds))
            : { data: [] };

        const { data: specialistRows } =
          specialistIds.size > 0
            ? await supabase
                .from("especialistas")
                .select("id, nome, especialidade")
                .in("id", Array.from(specialistIds))
            : { data: [] };

        const clientMap = Object.fromEntries(
          (clientRows ?? []).map((row) => [row.id, { nome: row.nome, telefone: row.telefone }])
        );
        const specialistMap = Object.fromEntries(
          (specialistRows ?? []).map((row) => [
            row.id,
            { nome: row.nome, especialidade: row.especialidade },
          ])
        );

        const context = {
          tenant_id,
          clinica_nome: clinicaNome,
          channel: "whatsapp",
          contato: {
            telefone: senderPhone,
            nome: clientName ?? messageInfo.pushName ?? null,
          },
          servicos: servicosRows.data ?? [],
          horarios: horariosRows.data ?? [],
          horarios_vagos: freeSlots,
          especialistas: todosEspecialistasRows.data ?? [],
          counts: {
            clientes: clientesCount.count ?? 0,
            especialistas: especialistasCount.count ?? 0,
            agendamentos: agendamentosCount.count ?? 0,
          },
          upcoming_agendamentos: (upcoming ?? []).map((item) => ({
            id: item.id,
            data_hora: item.data_hora,
            status: item.status,
            cliente: clientMap[item.cliente_id ?? ""] ?? null,
            especialista: specialistMap[item.especialista_id ?? ""] ?? null,
          })),
          now: new Date().toISOString(),
        };

        const allowMediaAnalysis = process.env.SOLARA_MEDIA_ANALYSIS === "true";
        const inlineMedia = allowMediaAnalysis ? await loadInlineMedia(media) : null;
        const extraUserParts = inlineMedia
          ? [
              { text: "Midia recebida para analise." },
              { inline_data: { mime_type: inlineMedia.mime, data: inlineMedia.data } },
            ]
          : undefined;

        const geminiKey = process.env.GEMINI_API_KEY;
        const geminiModel = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
        const evoKey = process.env.EVOLUTION_API_KEY ?? "";
        if (!geminiKey || !evoKey || !conexao?.instance_id || !conexao?.api_url) {
          return NextResponse.json({ ok: true });
        }

        const geminiResult = await requestGeminiReply({
          apiKey: geminiKey,
          model: geminiModel,
          context,
          history: (history ?? []).map((item: { role: string; content: string }) => ({
            role: item.role,
            content: item.content,
          })),
          extraUserParts,
        });

        const fallbackText = messageInfo.mediaKind
          ? "Recebi sua midia. Se puder, descreva em texto para eu ajudar melhor."
          : "Desculpe, nao consegui responder agora. Pode repetir?";

        const replyText = geminiResult.ok ? geminiResult.replyText : fallbackText;
        await supabase.from("solara_messages").insert({
          thread_id: threadId,
          role: "assistant",
          content: replyText,
          metadata: { model: geminiModel },
        });

        await fetch(
          `${conexao.api_url.replace(/\/+$/, "")}/message/sendText/${conexao.instance_id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: evoKey,
            },
            body: JSON.stringify({
              number: senderPhone,
              text: replyText,
            }),
          }
        );
      }
    } catch {
      // ignore logging errors for webhook ingestion
    }
  }

  return NextResponse.json({ ok: true });
}

export function GET() {
  return NextResponse.json({ ok: true });
}
