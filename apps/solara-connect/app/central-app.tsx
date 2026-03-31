"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AppointmentRow,
  AtendimentoRow,
  ClientRow,
  EvolutionConnectionRow,
  EvolutionEventRow,
  PaymentRow,
  PagbankAlertRow,
  PagbankEventRow,
  SpecialistRow,
  SolaraStatusRow,
  TenantRow,
  NpsRow,
  SolaraAutomationSettingsRow,
  createAppointment,
  createAtendimento,
  createClient,
  createEvolutionConnection,
  createPayment,
  createSpecialist,
  fetchSolaraStatus,
  fetchSolaraAutomationSettings,
  fetchDashboardData,
  fetchUserTenants,
  setActiveTenantId,
  upsertSolaraStatus,
  upsertSolaraAutomationSettings,
  updateEvolutionConnection,
  updateTenant,
  updateAppointment,
  updateAtendimentoStatus,
  updateClient,
  updatePaymentPagbank,
  updatePayment,
  updateSpecialist,
} from "./data";
import { getSupabaseClient, hasSupabaseEnv } from "./supabase-client";

type SectionKey =
  | "dashboard"
  | "kanban"
  | "clientes"
  | "especialistas"
  | "agenda"
  | "cobrancas"
  | "whatsapp"
  | "nps"
  | "automacoes"
  | "privacidade";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

type SolaraMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  criado_em?: string | null;
};

function Modal({ open, title, onClose, children, footer }: ModalProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header>
          <h3>{title}</h3>
          <button className="ghost" onClick={onClose} type="button">
            Fechar
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "--";
  const date = new Date(value);
  return date.toLocaleDateString("pt-BR");
}

function formatTime(value: string) {
  if (!value) return "--";
  const date = new Date(value);
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatMoney(value: number, hidden: boolean) {
  if (hidden) return "R$ ••••";
  return `R$ ${value.toFixed(2)}`;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractPayloadRecord(evento: EvolutionEventRow) {
  const payload = toRecord(evento.payload);
  if (!payload) return null;
  const rawData = payload.data;
  if (Array.isArray(rawData)) {
    const first = toRecord(rawData[0]);
    return first ?? payload;
  }
  return toRecord(rawData) ?? payload;
}

function extractWhatsAppEventText(evento: EvolutionEventRow) {
  const root = extractPayloadRecord(evento);
  if (root) {
    const queue: unknown[] = [root];
    while (queue.length > 0) {
      const current = queue.shift();
      if (Array.isArray(current)) {
        queue.push(...current);
        continue;
      }
      const record = toRecord(current);
      if (!record) continue;
      const direct =
        firstText(record.text) ??
        firstText(record.body) ??
        firstText(record.conversation) ??
        firstText(record.caption) ??
        firstText(record.title) ??
        firstText(record.selectedDisplayText) ??
        firstText(toRecord(record.extendedTextMessage)?.text) ??
        firstText(toRecord(record.imageMessage)?.caption) ??
        firstText(toRecord(record.videoMessage)?.caption) ??
        firstText(toRecord(record.documentMessage)?.caption);
      if (direct) return direct;
      queue.push(...Object.values(record));
    }
  }

  if (evento.media_type === "image") return "[Imagem recebida]";
  if (evento.media_type === "audio") return "[Áudio recebido]";
  if (evento.media_type) return `[Anexo ${evento.media_type}]`;
  return evento.event ?? "Evento de WhatsApp";
}

function extractEventDirection(evento: EvolutionEventRow) {
  const record = extractPayloadRecord(evento);
  const key = toRecord(record?.key) ?? toRecord(toRecord(record?.message)?.key);
  const fromMe =
    Boolean(key?.fromMe) ||
    Boolean(record?.fromMe) ||
    Boolean(toRecord(record?.message)?.fromMe);
  if (fromMe) return "out";
  const eventLabel = (evento.event ?? "").toLowerCase();
  if (eventLabel.includes("send") || eventLabel.includes("outgoing")) return "out";
  return "in";
}

function extractEventPhone(evento: EvolutionEventRow) {
  const record = extractPayloadRecord(evento);
  const key = toRecord(record?.key) ?? toRecord(toRecord(record?.message)?.key);
  const remoteJid =
    firstText(key?.remoteJid) ??
    firstText(record?.remoteJid) ??
    firstText(toRecord(record?.message)?.remoteJid);
  return remoteJid ? remoteJid.replace(/@.*/, "").replace(/\D/g, "") : "";
}

function extractEventClientLabel(evento: EvolutionEventRow) {
  const record = extractPayloadRecord(evento);
  const phone = extractEventPhone(evento);
  const pushName =
    firstText(record?.pushName) ??
    firstText(record?.pushname) ??
    firstText(record?.senderName);
  if (pushName && phone) return `${pushName} • ${phone}`;
  if (pushName) return pushName;
  if (phone) return phone;
  return "Cliente";
}

function mapPagbankStatusToLocal(status?: string | null) {
  const normalized = (status ?? "").toUpperCase();
  if (!normalized) return null;
  if (normalized === "PAID") return "Pago";
  if (["WAITING", "IN_ANALYSIS", "AUTHORIZED"].includes(normalized)) return "Pendente";
  if (["CANCELED", "DECLINED"].includes(normalized)) return "Cancelado";
  return null;
}

function buildPieGradient(items: { label: string; value: number; color: string }[]) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    return "conic-gradient(#dfe6e9 0deg, #dfe6e9 360deg)";
  }
  let current = 0;
  const segments = items
    .filter((item) => item.value > 0)
    .map((item) => {
      const start = (current / total) * 360;
      current += item.value;
      const end = (current / total) * 360;
      return `${item.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
    })
    .join(", ");
  return `conic-gradient(${segments})`;
}

function buildCsvValue(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const content = [
    headers.map(buildCsvValue).join(";"),
    ...rows.map((row) => headers.map((key) => buildCsvValue(row[key])).join(";")),
  ].join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const DEFAULT_AUTOMATION_COPY = {
  nps_message:
    "Oi {cliente}! Em uma escala de 0 a 10, o quanto voce recomendaria a {clinica}?",
  birthday_message:
    "Feliz aniversario, {cliente}! A {clinica} deseja um dia especial.",
  christmas_message: "A {clinica} deseja um Feliz Natal e um otimo fim de ano!",
  newyear_message:
    "A {clinica} deseja um Feliz Ano Novo! Conte com a gente em {ano}.",
  followup_7d_message:
    "Oi {cliente}! Como voce esta apos a consulta? Posso ajudar em algo?",
  followup_11m_message:
    "Oi {cliente}, ja faz quase um ano da sua ultima consulta. Deseja agendar um retorno?",
};

function buildAutomationDraft(
  settings: SolaraAutomationSettingsRow | null
): Partial<SolaraAutomationSettingsRow> {
  return {
    auto_reply_enabled: settings?.auto_reply_enabled ?? true,
    nps_enabled: settings?.nps_enabled ?? true,
    nps_message: settings?.nps_message ?? DEFAULT_AUTOMATION_COPY.nps_message,
    birthday_enabled: settings?.birthday_enabled ?? true,
    birthday_message: settings?.birthday_message ?? DEFAULT_AUTOMATION_COPY.birthday_message,
    christmas_enabled: settings?.christmas_enabled ?? true,
    christmas_message: settings?.christmas_message ?? DEFAULT_AUTOMATION_COPY.christmas_message,
    newyear_enabled: settings?.newyear_enabled ?? true,
    newyear_message: settings?.newyear_message ?? DEFAULT_AUTOMATION_COPY.newyear_message,
    followup_7d_enabled: settings?.followup_7d_enabled ?? true,
    followup_7d_message:
      settings?.followup_7d_message ?? DEFAULT_AUTOMATION_COPY.followup_7d_message,
    followup_11m_enabled: settings?.followup_11m_enabled ?? true,
    followup_11m_message:
      settings?.followup_11m_message ?? DEFAULT_AUTOMATION_COPY.followup_11m_message,
  };
}

export default function CentralApp() {
  const [activeSection, setActiveSection] = useState<SectionKey>("dashboard");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [clock, setClock] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hideMoney, setHideMoney] = useState(false);

  const [clientes, setClientes] = useState<ClientRow[]>([]);
  const [especialistas, setEspecialistas] = useState<SpecialistRow[]>([]);
  const [agendamentos, setAgendamentos] = useState<AppointmentRow[]>([]);
  const [cobrancas, setCobrancas] = useState<PaymentRow[]>([]);
  const [pagbankAlertas, setPagbankAlertas] = useState<PagbankAlertRow[]>([]);
  const [pagbankEventos, setPagbankEventos] = useState<PagbankEventRow[]>([]);
  const [atendimentos, setAtendimentos] = useState<AtendimentoRow[]>([]);
  const [conexoes, setConexoes] = useState<EvolutionConnectionRow[]>([]);
  const [eventos, setEventos] = useState<EvolutionEventRow[]>([]);
  const [npsRespostas, setNpsRespostas] = useState<NpsRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [solaraStatus, setSolaraStatus] = useState<SolaraStatusRow | null>(null);

  // --- Framer Motion Variants ---
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: "easeOut" },
    },
  };

  const pulseVariants = {
    pulse: {
      scale: [1, 1.25, 1],
      opacity: [0.7, 0.4, 0.7],
      transition: {
        duration: 2,
        repeat: Infinity,
      },
    },
  };

  const [kanbanFilter, setKanbanFilter] = useState("Todos");
  const [clientFilter, setClientFilter] = useState("Todos");
  const [specialistFilter, setSpecialistFilter] = useState("Todos");
  const [agendaFilter, setAgendaFilter] = useState("Todos");
  const [paymentFilter, setPaymentFilter] = useState("Todos");

  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [specialistModalOpen, setSpecialistModalOpen] = useState(false);
  const [agendaModalOpen, setAgendaModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [atendimentoModalOpen, setAtendimentoModalOpen] = useState(false);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [pagbankDetailsOpen, setPagbankDetailsOpen] = useState(false);
  const [reconcileStatus, setReconcileStatus] = useState<string | null>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [privacyClientId, setPrivacyClientId] = useState("");
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [lastDashboardUpdate, setLastDashboardUpdate] = useState<Date | null>(null);

  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [editingSpecialist, setEditingSpecialist] = useState<SpecialistRow | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentRow | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [editingAtendimento, setEditingAtendimento] = useState<AtendimentoRow | null>(null);

  const [newClient, setNewClient] = useState({
    nome: "",
    telefone: "",
    email: "",
    tax_id: "",
    status: "Novo",
  });
  const [newSpecialist, setNewSpecialist] = useState({
    nome: "",
    especialidade: "",
    ativo: true,
  });
  const [newAppointment, setNewAppointment] = useState({
    cliente_id: "",
    especialista_id: "",
    data: "",
    hora: "",
    status: "Agendado",
  });
  const [newPayment, setNewPayment] = useState({
    cliente_id: "",
    valor: "",
    status: "Pendente",
  });
  const [pixPayload, setPixPayload] = useState<{
    orderId?: string | null;
    referenceId?: string | null;
    qrCodeText?: string | null;
    qrCodeImageUrl?: string | null;
  } | null>(null);
  const [newAtendimento, setNewAtendimento] = useState({
    cliente_id: "",
    status: "Novo",
    canal: "",
    responsavel: "",
  });
  const [pixCopyStatus, setPixCopyStatus] = useState<string | null>(null);
  const [newConexao, setNewConexao] = useState({
    nome: "",
    telefone: "",
    instance_id: "",
    api_url: "",
  });
  const [sendClientName, setSendClientName] = useState("");
  const [sendTarget, setSendTarget] = useState("");
  const [sendText, setSendText] = useState("");
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [clearConversationLoading, setClearConversationLoading] = useState(false);
  const [selectedConexaoId, setSelectedConexaoId] = useState<string | null>(null);
  const [selectedWhatsAppThread, setSelectedWhatsAppThread] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingPhone, setOnboardingPhone] = useState("");
  const [onboardingInstance, setOnboardingInstance] = useState("");
  const [onboardingApiUrl, setOnboardingApiUrl] = useState("");
  const searchParams = useSearchParams();
  const [newEventsCount, setNewEventsCount] = useState(0);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [solaraOpen, setSolaraOpen] = useState(false);
  const [solaraThreadId, setSolaraThreadId] = useState<string | null>(null);
  const [solaraMessages, setSolaraMessages] = useState<SolaraMessage[]>([]);
  const [solaraInput, setSolaraInput] = useState("");
  const [solaraLoading, setSolaraLoading] = useState(false);
  const [solaraError, setSolaraError] = useState<string | null>(null);
  const solaraBodyRef = useRef<HTMLDivElement | null>(null);
  const whatsappBodyRef = useRef<HTMLDivElement | null>(null);
  const whatsappBootstrapRef = useRef(false);
  const [automationDraft, setAutomationDraft] = useState<
    Partial<SolaraAutomationSettingsRow>
  >({});
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [draggingAtendimentoId, setDraggingAtendimentoId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  const clientMap = useMemo(() => {
    return Object.fromEntries(clientes.map((client) => [client.id, client.nome]));
  }, [clientes]);

  const clientPhoneMap = useMemo(() => {
    return Object.fromEntries(clientes.map((client) => [client.id, client.telefone]));
  }, [clientes]);

  const clientEmailMap = useMemo(() => {
    return Object.fromEntries(clientes.map((client) => [client.id, client.email ?? ""]));
  }, [clientes]);

  const clientTaxIdMap = useMemo(() => {
    return Object.fromEntries(clientes.map((client) => [client.id, client.tax_id ?? ""]));
  }, [clientes]);

  const selectedConexao = useMemo(
    () => conexoes.find((item) => item.id === selectedConexaoId) ?? null,
    [conexoes, selectedConexaoId]
  );
  const currentTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? null,
    [tenants, selectedTenantId]
  );

  const whatsappTimeline = useMemo(() => {
    const filteredByInstance = selectedConexao
      ? eventos.filter((evento) => evento.instance_id === selectedConexao.instance_id)
      : [];
    const source = filteredByInstance.length > 0 ? filteredByInstance : eventos;
    return source
      .filter((evento) => {
        const eventLabel = (evento.event ?? "").toLowerCase();
        const isMessageEvent =
          eventLabel.includes("message") ||
          eventLabel.includes("conversation") ||
          eventLabel.includes("solara_handoff");
        return isMessageEvent || Boolean(evento.media_type);
      })
      .sort((a, b) => {
      const aTime = a.criado_em ? new Date(a.criado_em).getTime() : 0;
      const bTime = b.criado_em ? new Date(b.criado_em).getTime() : 0;
      return aTime - bTime;
      });
  }, [eventos, selectedConexao]);

  const whatsappConversations = useMemo(() => {
    const byThread = new Map<
      string,
      {
        id: string;
        label: string;
        phone: string;
        lastMessage: string;
        lastAt: number;
        messages: EvolutionEventRow[];
      }
    >();

    whatsappTimeline.forEach((evento) => {
      const phone = extractEventPhone(evento);
      const label = extractEventClientLabel(evento);
      const threadId = phone || label;
      if (!threadId) return;
      const current = byThread.get(threadId);
      const createdAt = evento.criado_em ? new Date(evento.criado_em).getTime() : 0;
      const messageText = extractWhatsAppEventText(evento);
      if (!current) {
        byThread.set(threadId, {
          id: threadId,
          label,
          phone,
          lastMessage: messageText,
          lastAt: createdAt,
          messages: [evento],
        });
      } else {
        current.messages.push(evento);
        if (createdAt >= current.lastAt) {
          current.lastAt = createdAt;
          current.lastMessage = messageText;
        }
      }
    });

    return Array.from(byThread.values()).sort((a, b) => b.lastAt - a.lastAt);
  }, [whatsappTimeline]);

  const selectedWhatsAppConversation = useMemo(() => {
    if (whatsappConversations.length === 0) return null;
    if (!selectedWhatsAppThread) return whatsappConversations[0];
    return (
      whatsappConversations.find((thread) => thread.id === selectedWhatsAppThread) ??
      whatsappConversations[0]
    );
  }, [whatsappConversations, selectedWhatsAppThread]);

  const specialistMap = useMemo(() => {
    return Object.fromEntries(
      especialistas.map((specialist) => [specialist.id, specialist.nome])
    );
  }, [especialistas]);

  const agendaStatusList = [
    "Agendado",
    "Confirmado",
    "Em atendimento",
    "Concluído",
    "Cancelado",
  ];

  const agendaStatusColors = useMemo<Record<string, string>>(
    () => ({
      Agendado: "#74b9ff",
      Confirmado: "#81ecec",
      "Em atendimento": "#ffeaa7",
      "Concluído": "#55efc4",
      Cancelado: "#ff7675",
    }),
    []
  );

  const billingStatus = useMemo(() => {
    const currentTenant = tenants.find((tenant) => tenant.id === selectedTenantId);
    const raw = (currentTenant?.billing_status ?? "").toLowerCase();
    if (raw === "desativado" || currentTenant?.ativo === false) {
      return { label: "DESATIVADO", color: "status-dot--red" };
    }
    if (raw === "pendente") {
      return { label: "PENDENTE", color: "status-dot--yellow" };
    }
    return { label: "ATIVO", color: "status-dot--green" };
  }, [tenants, selectedTenantId]);

  useEffect(() => {
    let mounted = true;
    async function loadTenants() {
      let list = await fetchUserTenants();
      if (!mounted) return;

      // Se nao houver nenhum tenant (clinica) vinculado ao usuario, tentamos vincular/criar um automaticamente.
      if (list.length === 0) {
        const accessToken = await getAccessToken();
        if (accessToken) {
          await fetch("/api/tenants/ensure", {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          list = await fetchUserTenants();
          if (!mounted) return;
        }
      }

      setTenants(list);
      const stored = typeof window !== "undefined" ? localStorage.getItem("solara.tenant") : null;
      const match = list.find((tenant) => tenant.id === stored);
      const nextTenant = match?.id ?? list[0]?.id ?? null;
      setSelectedTenantId((prev) => prev ?? nextTenant);
      setActiveTenantId(nextTenant);
    }
    loadTenants();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const data = await fetchDashboardData();
      if (!mounted) return;
      setClientes(data.clientes);
      setEspecialistas(data.especialistas);
      setAgendamentos(data.agendamentos);
      setCobrancas(data.cobrancas);
      setAtendimentos(data.atendimentos);
      setConexoes(data.conexoes ?? []);
      setEventos(data.eventos ?? []);
      setNpsRespostas(data.npsRespostas ?? []);
      setPagbankAlertas(data.pagbankAlertas ?? []);
      setPagbankEventos(data.pagbankEventos ?? []);
      const status = await fetchSolaraStatus();
      setSolaraStatus(status);
      setLoading(false);
      setLastDashboardUpdate(new Date());
    }
    if (selectedTenantId) {
      setActiveTenantId(selectedTenantId);
      if (typeof window !== "undefined") {
        localStorage.setItem("solara.tenant", selectedTenantId);
      }
      load();
    }
    return () => {
      mounted = false;
    };
  }, [selectedTenantId]);

  useEffect(() => {
    if (!selectedConexaoId && conexoes.length > 0) {
      setSelectedConexaoId(conexoes[0].id);
    }
  }, [conexoes, selectedConexaoId]);

  useEffect(() => {
    setSelectedWhatsAppThread(null);
  }, [selectedConexaoId]);

  useEffect(() => {
    whatsappBootstrapRef.current = false;
  }, [selectedTenantId]);

  useEffect(() => {
    const shouldOpen = searchParams?.get("onboarding") === "1";
    if (shouldOpen) {
      setOnboardingOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!onboardingOpen) return;
    const currentTenant = tenants.find((tenant) => tenant.id === selectedTenantId);
    const currentConexao = conexoes.find((item) => item.id === selectedConexaoId);
    setOnboardingName(currentTenant?.nome ?? "");
    setOnboardingPhone(currentConexao?.telefone ?? "5512991187251");
    setOnboardingInstance(currentConexao?.instance_id ?? "");
    setOnboardingApiUrl(currentConexao?.api_url ?? "https://evoapi.axoshub.com");
  }, [onboardingOpen, tenants, selectedTenantId, conexoes, selectedConexaoId]);

  useEffect(() => {
    if (eventos.length === 0) return;
    if (!lastEventId) {
      setLastEventId(eventos[0].id);
      return;
    }
    if (eventos[0].id !== lastEventId) {
      setNewEventsCount((prev) => prev + 1);
      setLastEventId(eventos[0].id);
    }
  }, [eventos, lastEventId]);

  useEffect(() => {
    const missing = eventos.filter((evento) => evento.media_path && !mediaUrls[evento.id]);
    if (missing.length === 0) return;
    missing.forEach(async (evento) => {
      try {
        const client = getSupabaseClient();
        const sessionResult = client ? await client.auth.getSession() : null;
        const accessToken = sessionResult?.data?.session?.access_token;
        if (!accessToken) return;
        const response = await fetch("/api/evolution/media-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ event_id: evento.id }),
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload?.url) {
          setMediaUrls((prev) => ({ ...prev, [evento.id]: payload.url }));
        }
      } catch {
        // ignore
      }
    });
  }, [eventos, mediaUrls]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSolaraThreadId(null);
    setSolaraMessages([]);
    setSolaraError(null);
  }, [selectedTenantId]);

  const loadAutomationSettings = async () => {
    setAutomationLoading(true);
    const settings = await fetchSolaraAutomationSettings();
    setAutomationDraft(buildAutomationDraft(settings));
    setAutomationLoading(false);
  };

  useEffect(() => {
    if (activeSection !== "automacoes") return;
    loadAutomationSettings();
  }, [activeSection, selectedTenantId]);

  const getAccessToken = async () => {
    const client = getSupabaseClient();
    if (!client) return null;
    const sessionResult = await client.auth.getSession();
    return sessionResult.data?.session?.access_token ?? null;
  };

  const extractApiError = async (response: Response, fallback: string) => {
    try {
      const raw = await response.text();
      if (!raw) return fallback;
      try {
        const parsed = JSON.parse(raw) as { error?: string; message?: string };
        return parsed.error || parsed.message || fallback;
      } catch {
        return raw;
      }
    } catch {
      return fallback;
    }
  };

  const loadWhatsAppTimeline = async () => {
    if (activeSection !== "whatsapp") return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    const instanceParam = selectedConexao?.instance_id
      ? `?instance_id=${encodeURIComponent(selectedConexao.instance_id)}`
      : "";
    const response = await fetch(`/api/evolution/timeline${instanceParam}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) return;
    const payload = await response.json().catch(() => null);
    if (Array.isArray(payload?.events)) {
      setEventos(payload.events);
    }
  };

  useEffect(() => {
    if (activeSection !== "whatsapp") return;
    if (!selectedTenantId || loading || conexoes.length > 0) return;
    if (whatsappBootstrapRef.current) return;
    whatsappBootstrapRef.current = true;
    let mounted = true;

    async function bootstrapWhatsappConnection() {
      setSendStatus("Preparando conexão automática da clínica...");
      const accessToken = await getAccessToken();
      if (!accessToken) {
        if (mounted) setSendStatus("Sessão inválida. Faça login novamente.");
        return;
      }

      const response = await fetch("/api/tenants/ensure", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const message = await extractApiError(
          response,
          "Falha ao preparar conexão da clínica."
        );
        if (mounted) setSendStatus(message);
        return;
      }

      const data = await fetchDashboardData();
      if (!mounted) return;
      const nextConexoes = data.conexoes ?? [];
      setConexoes(nextConexoes);
      setEventos(data.eventos ?? []);
      if (nextConexoes.length > 0) {
        setSelectedConexaoId((prev) => prev ?? nextConexoes[0].id);
        setSendStatus(null);
      } else {
        setSendStatus("Conexão não encontrada. Abra Configurar clínica.");
      }
    }

    bootstrapWhatsappConnection().catch(() => {
      if (mounted) setSendStatus("Falha ao preparar conexão da clínica.");
    });

    return () => {
      mounted = false;
    };
  }, [activeSection, selectedTenantId, loading, conexoes.length]);

  const loadSolaraThread = async (options?: { forceNew?: boolean }) => {
    if (!selectedTenantId) return;
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setSolaraError("Sessao invalida. Faca login novamente.");
      return;
    }
    setSolaraError(null);
    try {
      const response = await fetch("/api/solara/thread", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          tenant_id: selectedTenantId,
          source: "ui",
          force_new: options?.forceNew ?? false,
        }),
      });
      if (!response.ok) {
        const message = await extractApiError(
          response,
          "Nao foi possivel abrir a Solara."
        );
        setSolaraError(message);
        return;
      }
      const payload = await response.json();
      const threadId = payload?.thread?.id ?? null;
      if (!threadId) {
        setSolaraError("Nao foi possivel iniciar a Solara.");
        return;
      }
      setSolaraThreadId(threadId);
      setSolaraMessages(payload?.messages ?? []);
    } catch {
      setSolaraError("Falha ao carregar a Solara.");
    }
  };

  const handleSolaraClear = async () => {
    if (!solaraOpen) return;
    setSolaraError(null);
    setSolaraMessages([]);
    setSolaraThreadId(null);
    await loadSolaraThread({ forceNew: true });
  };

  useEffect(() => {
    if (!solaraOpen) return;
    loadSolaraThread();
  }, [solaraOpen, selectedTenantId]);

  useEffect(() => {
    if (!solaraOpen) return;
    if (selectedTenantId || tenants.length !== 1) return;
    const onlyTenant = tenants[0]?.id ?? null;
    if (!onlyTenant) return;
    setSelectedTenantId(onlyTenant);
    setActiveTenantId(onlyTenant);
    if (typeof window !== "undefined") {
      localStorage.setItem("solara.tenant", onlyTenant);
    }
  }, [solaraOpen, selectedTenantId, tenants]);

  useEffect(() => {
    if (!solaraOpen) return;
    const container = solaraBodyRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [solaraOpen, solaraMessages, solaraLoading, solaraError]);

  useEffect(() => {
    if (activeSection !== "whatsapp") return;
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await loadWhatsAppTimeline();
    };
    run();
    const timer = window.setInterval(run, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [activeSection, selectedConexao?.instance_id, selectedTenantId]);

  useEffect(() => {
    const container = whatsappBodyRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [selectedWhatsAppConversation]);

  useEffect(() => {
    const clinicPhone = (selectedConexao?.telefone ?? "").replace(/\D/g, "");
    if (!selectedWhatsAppConversation) {
      setSendClientName("");
      setSendTarget((prev) => {
        const prevDigits = prev.replace(/\D/g, "");
        if (clinicPhone && prevDigits === clinicPhone) return "";
        return prev;
      });
      return;
    }
    const baseName = selectedWhatsAppConversation.label.split(" • ")[0]?.trim() ?? "";
    const nextName = baseName === "Cliente" ? "" : baseName;
    setSendClientName(nextName);
    if (selectedWhatsAppConversation.phone) {
      const conversationPhone = selectedWhatsAppConversation.phone.replace(/\D/g, "");
      if (conversationPhone && conversationPhone !== clinicPhone) {
        setSendTarget(conversationPhone);
      } else {
        setSendTarget("");
      }
    }
  }, [selectedWhatsAppConversation, selectedConexao?.telefone]);

  const matchesSearch = (value: string) =>
    value.toLowerCase().includes(searchQuery.trim().toLowerCase());

  useEffect(() => {
    if (!search.trim()) {
      setSearchQuery("");
    }
  }, [search]);

  const filteredClientes = clientes.filter((client) => {
    const statusMatch = clientFilter === "Todos" || client.status === clientFilter;
    const searchMatch = !search || matchesSearch(client.nome);
    return statusMatch && searchMatch;
  });

  const filteredEspecialistas = especialistas.filter((specialist) => {
    const statusMatch =
      specialistFilter === "Todos" ||
      (specialistFilter === "Ativos" && specialist.ativo) ||
      (specialistFilter === "Inativos" && !specialist.ativo);
    const searchMatch = !search || matchesSearch(specialist.nome);
    return statusMatch && searchMatch;
  });

  const filteredNps = npsRespostas.filter((item) => {
    if (!search) return true;
    const clientName = item.cliente_id ? clientMap[item.cliente_id] : "";
    return matchesSearch(clientName ?? "");
  });

  const weeklyReport = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    const inRange = agendamentos.filter((item) => {
      const date = new Date(item.data_hora);
      return date >= start && date <= now;
    });
    const counts = agendaStatusList.map((status) => ({
      label: status,
      value: inRange.filter((item) => item.status === status).length,
      color: agendaStatusColors[status] ?? "#dfe6e9",
    }));
    return {
      items: counts,
      total: counts.reduce((sum, item) => sum + item.value, 0),
    };
  }, [agendamentos, agendaStatusColors, agendaStatusList]);

  const monthlyReport = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    const inRange = agendamentos.filter((item) => {
      const date = new Date(item.data_hora);
      return date >= start && date <= now;
    });
    const counts = agendaStatusList.map((status) => ({
      label: status,
      value: inRange.filter((item) => item.status === status).length,
      color: agendaStatusColors[status] ?? "#dfe6e9",
    }));
    return {
      items: counts,
      total: counts.reduce((sum, item) => sum + item.value, 0),
    };
  }, [agendamentos, agendaStatusColors, agendaStatusList]);

  const filteredAgendamentos = agendamentos.filter((appointment) => {
    const statusMatch = agendaFilter === "Todos" || appointment.status === agendaFilter;
    const searchMatch =
      !search ||
      matchesSearch(clientMap[appointment.cliente_id] ?? "") ||
      matchesSearch(specialistMap[appointment.especialista_id] ?? "");
    return statusMatch && searchMatch;
  });

  const filteredCobrancas = cobrancas.filter((payment) => {
    const statusMatch = paymentFilter === "Todos" || payment.status === paymentFilter;
    const searchMatch =
      !search || matchesSearch(clientMap[payment.cliente_id] ?? "");
    return statusMatch && searchMatch;
  });

  const cobrancasSemPagbank = cobrancas.filter(
    (payment) => !payment.pagbank_order_id && !payment.pagbank_reference_id
  );

  const cobrancasDivergentes = cobrancas.filter((payment) => {
    const mapped = mapPagbankStatusToLocal(payment.pagbank_status ?? null);
    return Boolean(mapped && mapped !== payment.status);
  });

  const cobrancasComTaxas = cobrancas.filter(
    (payment) => typeof payment.pagbank_fee === "number"
  );
  const totalFees = cobrancasComTaxas.reduce(
    (sum, payment) => sum + (payment.pagbank_fee ?? 0),
    0
  );
  const totalNet = cobrancasComTaxas.reduce(
    (sum, payment) => sum + (payment.pagbank_net_amount ?? 0),
    0
  );

  const filteredAtendimentos = atendimentos.filter((atendimento) => {
    const statusMatch = kanbanFilter === "Todos" || atendimento.status === kanbanFilter;
    const searchMatch =
      !search || matchesSearch(clientMap[atendimento.cliente_id ?? ""] ?? "");
    return statusMatch && searchMatch;
  });

  const handleCreateClient = async () => {
    setSaveError(null);
    if (!newClient.nome.trim()) return;
    try {
      const created = await createClient(newClient);
      if (!created) {
        setSaveError("Falha ao salvar cliente no Supabase.");
        return;
      }
      setClientes((prev) => [created, ...prev]);
      setClientModalOpen(false);
      setNewClient({
        nome: "",
        telefone: "",
        email: "",
        tax_id: "",
        status: "Novo",
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Falha ao salvar cliente no Supabase.");
    }
  };

  const handleCreateSpecialist = async () => {
    setSaveError(null);
    if (!newSpecialist.nome.trim()) return;
    try {
      const created = await createSpecialist(newSpecialist);
      if (!created) {
        setSaveError("Falha ao salvar especialista no Supabase.");
        return;
      }
      setEspecialistas((prev) => [created, ...prev]);
      setSpecialistModalOpen(false);
      setNewSpecialist({ nome: "", especialidade: "", ativo: true });
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Falha ao salvar especialista no Supabase."
      );
    }
  };

  const handleCreateAppointment = async () => {
    setSaveError(null);
    if (!newAppointment.cliente_id || !newAppointment.especialista_id) return;
    const iso = `${newAppointment.data}T${newAppointment.hora || "09:00"}:00`;
    const created = await createAppointment({
      cliente_id: newAppointment.cliente_id,
      especialista_id: newAppointment.especialista_id,
      data_hora: iso,
      status: newAppointment.status,
    });
    if (!created) {
      setSaveError("Falha ao salvar agendamento no Supabase.");
      return;
    }
    setAgendamentos((prev) => [created, ...prev]);
    setAgendaModalOpen(false);
    setNewAppointment({
      cliente_id: "",
      especialista_id: "",
      data: "",
      hora: "",
      status: "Agendado",
    });
  };

  const handleCreatePayment = async () => {
    setSaveError(null);
    if (!newPayment.cliente_id || !newPayment.valor) return;
    const created = await createPayment({
      cliente_id: newPayment.cliente_id,
      valor: Number(newPayment.valor),
      status: newPayment.status,
    });
    if (!created) {
      setSaveError("Falha ao salvar cobrança no Supabase.");
      return;
    }
    let nextPayment = created;
    try {
      const response = await fetch("/api/pagbank/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceId: created.id,
          amount: Number(newPayment.valor),
          customer: {
            name: clientMap[created.cliente_id] ?? "Cliente Solara",
            phone: clientPhoneMap[created.cliente_id] ?? "",
            email: clientEmailMap[created.cliente_id] ?? "",
            taxId: clientTaxIdMap[created.cliente_id] ?? "",
          },
        }),
      });
      if (response.ok) {
        const payload = await response.json();
        setPixPayload(payload);
        setPixCopyStatus(null);
        setPixModalOpen(true);
        const updated = await updatePaymentPagbank(created.id, {
          pagbank_order_id: payload.orderId ?? null,
          pagbank_reference_id: payload.referenceId ?? null,
          pagbank_qr_code_text: payload.qrCodeText ?? null,
          pagbank_qr_code_image_url: payload.qrCodeImageUrl ?? null,
          pagbank_status: "WAITING",
          pagbank_payload: payload.raw ?? null,
          pagbank_updated_at: new Date().toISOString(),
          pagbank_expires_at: payload.expiresAt ?? null,
        });
        if (updated) {
          nextPayment = updated;
        }
      } else {
        setSaveError(
          "Cobrança salva, mas não foi possível gerar o PIX no PagBank."
        );
      }
    } catch {
      setSaveError("Cobrança salva, mas houve erro ao contactar o PagBank.");
    }
    setCobrancas((prev) => [nextPayment, ...prev]);
    setPaymentModalOpen(false);
    setNewPayment({ cliente_id: "", valor: "", status: "Pendente" });
  };

  const handleCreateAtendimento = async () => {
    setSaveError(null);
    if (!newAtendimento.status) return;
    const created = await createAtendimento({
      cliente_id: newAtendimento.cliente_id || null,
      status: newAtendimento.status,
      canal: newAtendimento.canal || null,
      responsavel: newAtendimento.responsavel || null,
    });
    if (!created) {
      setSaveError("Falha ao salvar atendimento no Supabase.");
      return;
    }
    setAtendimentos((prev) => [created, ...prev]);
    setAtendimentoModalOpen(false);
    setNewAtendimento({ cliente_id: "", status: "Novo", canal: "", responsavel: "" });
  };

  const handleCreateConexao = async () => {
    setSaveError(null);
    if (
      !newConexao.nome.trim() ||
      !newConexao.telefone.trim() ||
      !newConexao.instance_id.trim() ||
      !newConexao.api_url.trim()
    ) {
      setSaveError("Preencha nome, telefone, instance e URL da Evolution API.");
      return;
    }
    if (
      conexoes.some(
        (item) =>
          item.telefone === newConexao.telefone ||
          item.instance_id === newConexao.instance_id
      )
    ) {
      setSaveError("Já existe uma conexão com esse telefone ou instance.");
      return;
    }
    const created = await createEvolutionConnection({
      nome: newConexao.nome,
      telefone: newConexao.telefone,
      instance_id: newConexao.instance_id,
      api_url: newConexao.api_url,
    });
    if (!created) {
      setSaveError("Falha ao salvar conexão da Evolution API.");
      return;
    }
    setConexoes((prev) => [created, ...prev]);
    setNewConexao({ nome: "", telefone: "", instance_id: "", api_url: "" });
  };

  const handleSaveOnboarding = async () => {
    setSaveError(null);
    let effectiveTenantId = selectedTenantId ?? tenants[0]?.id ?? null;
    if (!effectiveTenantId) {
      const accessToken = await getAccessToken();
      if (accessToken) {
        await fetch("/api/tenants/ensure", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
      const refreshedTenants = await fetchUserTenants();
      if (refreshedTenants.length > 0) {
        effectiveTenantId = refreshedTenants[0].id;
        setTenants(refreshedTenants);
        setSelectedTenantId(effectiveTenantId);
        setActiveTenantId(effectiveTenantId);
        if (typeof window !== "undefined") {
          localStorage.setItem("solara.tenant", effectiveTenantId);
        }
      }
    }
    if (!effectiveTenantId) {
      setSaveError("Nao foi possivel identificar a clinica. Faca login novamente.");
      return;
    }
    if (!onboardingName.trim() || !onboardingPhone.trim()) {
      setSaveError("Preencha o nome da clinica e o telefone.");
      return;
    }
    const tenantUpdated = await updateTenant(effectiveTenantId, {
      nome: onboardingName.trim(),
    });
    if (tenantUpdated) {
      setTenants((prev) =>
        prev.map((item) => (item.id === tenantUpdated.id ? tenantUpdated : item))
      );
    }

    if (selectedConexaoId) {
      const updated = await updateEvolutionConnection(selectedConexaoId, {
        nome: onboardingName.trim(),
        telefone: onboardingPhone.trim(),
        instance_id: onboardingInstance.trim(),
        api_url: onboardingApiUrl.trim(),
        ativo: true,
      });
      if (updated) {
        setConexoes((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
      }
    } else {
      const created = await createEvolutionConnection({
        nome: onboardingName.trim(),
        telefone: onboardingPhone.trim(),
        instance_id: onboardingInstance.trim(),
        api_url: onboardingApiUrl.trim(),
      });
      if (created) {
        setConexoes((prev) => [created, ...prev]);
        setSelectedConexaoId(created.id);
      }
    }

    setOnboardingOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("onboarding");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleSolaraStatus = async (status: "ai" | "human") => {
    const updated = await upsertSolaraStatus(status);
    if (updated) {
      setSolaraStatus(updated);
    }
  };

  const handleSendText = async () => {
    setSendStatus(null);
    if (!sendTarget.trim() || !sendText.trim()) {
      setSendStatus("Preencha numero do cliente e mensagem.");
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setSendStatus("Sessao invalida. Faca login novamente.");
      return;
    }
    const conexaoSelecionada = conexoes.find((item) => item.id === selectedConexaoId);
    try {
      const response = await fetch("/api/evolution/send-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          number: sendTarget,
          text: sendText,
          instance_id: conexaoSelecionada?.instance_id,
          api_url: conexaoSelecionada?.api_url,
        }),
      });
      if (!response.ok) {
        const message = await extractApiError(response, "Falha ao enviar mensagem.");
        setSendStatus(message);
        return;
      }
      setSendStatus(
        sendClientName.trim()
          ? `Mensagem enviada para ${sendClientName.trim()}.`
          : "Mensagem enviada com sucesso."
      );
      const nowIso = new Date().toISOString();
      const normalizedTarget = sendTarget.replace(/\D/g, "");
      const localOutEvent: EvolutionEventRow = {
        id: `local-out-${Date.now()}`,
        event: "messages.upsert",
        instance_id: conexaoSelecionada?.instance_id ?? null,
        payload: {
          data: {
            key: {
              remoteJid: `${normalizedTarget}@s.whatsapp.net`,
              fromMe: true,
            },
            pushName: sendClientName.trim() || null,
            message: {
              conversation: sendText,
            },
          },
        },
        criado_em: nowIso,
      };
      setEventos((prev) => [...prev, localOutEvent]);
      setSendText("");
    } catch {
      setSendStatus("Falha ao enviar mensagem.");
    }
  };

  const handleWhatsAppMessageKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSendText();
    }
  };

  const handleWhatsAppComposeSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSendText();
  };

  const handleClearWhatsAppConversation = async () => {
    setSendStatus(null);
    if (!selectedWhatsAppConversation || selectedWhatsAppConversation.messages.length === 0) {
      setSendStatus("Nenhuma conversa selecionada para limpar.");
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setSendStatus("Sessao invalida. Faca login novamente.");
      return;
    }
    setClearConversationLoading(true);
    const eventIds = selectedWhatsAppConversation.messages.map((item) => item.id);
    try {
      const response = await fetch("/api/evolution/clear-thread", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          event_ids: eventIds,
          instance_id: selectedConexao?.instance_id ?? null,
        }),
      });
      if (!response.ok) {
        const message = await extractApiError(response, "Falha ao limpar conversa.");
        setSendStatus(message);
        return;
      }
      const payload = await response.json().catch(() => null);
      const deletedIds = new Set<string>(eventIds);
      setEventos((prev) => prev.filter((evento) => !deletedIds.has(evento.id)));
      setSendStatus(
        `Conversa limpa${typeof payload?.deleted === "number" ? ` (${payload.deleted})` : ""}.`
      );
      setSendText("");
    } catch {
      setSendStatus("Falha ao limpar conversa.");
    } finally {
      setClearConversationLoading(false);
    }
  };

  const handleSolaraSend = async () => {
    if (solaraLoading) return;
    const content = solaraInput.trim();
    if (!content) return;
    let effectiveTenantId = selectedTenantId;
    if (!effectiveTenantId && tenants.length === 1) {
      effectiveTenantId = tenants[0]?.id ?? null;
      if (effectiveTenantId) {
        setSelectedTenantId(effectiveTenantId);
        setActiveTenantId(effectiveTenantId);
        if (typeof window !== "undefined") {
          localStorage.setItem("solara.tenant", effectiveTenantId);
        }
      }
    }
    if (!effectiveTenantId) {
      const refreshed = await fetchUserTenants();
      if (refreshed.length > 0) {
        effectiveTenantId = refreshed[0].id;
        setTenants(refreshed);
        setSelectedTenantId(effectiveTenantId);
        setActiveTenantId(effectiveTenantId);
        if (typeof window !== "undefined") {
          localStorage.setItem("solara.tenant", effectiveTenantId);
        }
      }
    }
    if (!effectiveTenantId) {
      setSolaraError("Usuario sem clinica vinculada. Verifique o cadastro.");
      return;
    }
    setSolaraInput("");
    setSolaraError(null);
    setSolaraLoading(true);
    const tempId = `local-${Date.now()}`;
    setSolaraMessages((prev) => [...prev, { id: tempId, role: "user", content }]);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setSolaraError("Sessao invalida. Faca login novamente.");
        return;
      }
      const response = await fetch("/api/solara/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          tenant_id: effectiveTenantId,
          thread_id: solaraThreadId,
          message: content,
        }),
      });
      if (!response.ok) {
        const message = await extractApiError(
          response,
          "Falha ao falar com a Solara."
        );
        setSolaraError(message);
        return;
      }
      const payload = await response.json();
      if (payload?.thread_id) {
        setSolaraThreadId(payload.thread_id);
      }
      if (payload?.reply?.content) {
        setSolaraMessages((prev) => [
          ...prev,
          {
            id: payload.reply.id ?? `reply-${Date.now()}`,
            role: "assistant",
            content: payload.reply.content,
          },
        ]);
      } else {
        setSolaraError("Solara nao retornou resposta. Tente novamente.");
      }
    } catch {
      setSolaraError("Falha ao falar com a Solara.");
    } finally {
      setSolaraLoading(false);
    }
  };

  const handleOpenAtendimentoForClient = (clientId: string) => {
    setNewAtendimento({
      cliente_id: clientId,
      status: "Novo",
      canal: "WhatsApp",
      responsavel: "Recepção",
    });
    setAtendimentoModalOpen(true);
  };

  const handleAtendimentoQuickAction = async (id: string, status: string) => {
    setAtendimentos((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
    const updated = await updateAtendimentoStatus(id, status);
    if (!updated) {
      setSaveError("Falha ao atualizar atendimento. Tente novamente.");
      const refreshed = await fetchDashboardData();
      setAtendimentos(refreshed.atendimentos);
    }
  };

  const handleAgendarFromAtendimento = (clienteId: string | null) => {
    if (clienteId) {
      setNewAppointment((prev) => ({
        ...prev,
        cliente_id: clienteId,
      }));
    }
    setAgendaModalOpen(true);
  };

  const formatRelativeMinutes = (value?: string | null) => {
    if (!value) return "há alguns minutos";
    const diffMs = Date.now() - new Date(value).getTime();
    if (Number.isNaN(diffMs)) return "há alguns minutos";
    const minutes = Math.max(1, Math.round(diffMs / 60000));
    return `há ${minutes} min`;
  };

  const getFilaBadge = (status: string, criadoEm?: string | null) => {
    if (status === "Em andamento") return "fila-badge fila-badge--green";
    if (status === "Concluído") return "fila-badge fila-badge--dark";
    if (status === "Novo") return "fila-badge fila-badge--blue";
    if (status === "Aguardando") {
      const minutes = criadoEm
        ? Math.round((Date.now() - new Date(criadoEm).getTime()) / 60000)
        : 0;
      if (minutes >= 10) return "fila-badge fila-badge--red";
      return "fila-badge fila-badge--yellow";
    }
    return "fila-badge";
  };

  const handleKanbanDragStart = (event: React.DragEvent<HTMLDivElement>, id: string) => {
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    setDraggingAtendimentoId(id);
  };

  const handleKanbanDragOver = (event: React.DragEvent<HTMLDivElement>, status: string) => {
    event.preventDefault();
    setDragOverStatus(status);
  };

  const handleKanbanDrop = async (event: React.DragEvent<HTMLDivElement>, status: string) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggingAtendimentoId;
    setDragOverStatus(null);
    setDraggingAtendimentoId(null);
    if (!id) return;

    const current = atendimentos.find((item) => item.id === id);
    if (!current || current.status === status) return;

    setAtendimentos((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );

    const updated = await updateAtendimentoStatus(id, status);
    if (!updated) {
      setSaveError("Falha ao mover atendimento. Tente novamente.");
      const refreshed = await fetchDashboardData();
      setAtendimentos(refreshed.atendimentos);
    }
  };

  const handleSaveAutomation = async () => {
    setSaveError(null);
    setAutomationSaving(true);
    const saved = await upsertSolaraAutomationSettings(automationDraft);
    if (!saved) {
      setSaveError("Falha ao salvar as automacoes.");
      setAutomationSaving(false);
      return;
    }
    setAutomationDraft(buildAutomationDraft(saved));
    setAutomationSaving(false);
  };

  const handleUpdateClient = async () => {
    if (!editingClient) return;
    setSaveError(null);
    const updated = await updateClient(editingClient.id, {
      nome: editingClient.nome,
      telefone: editingClient.telefone,
      email: editingClient.email ?? "",
      tax_id: editingClient.tax_id ?? "",
      status: editingClient.status,
    });
    if (!updated) {
      setSaveError("Falha ao atualizar cliente no Supabase.");
      return;
    }
    setClientes((prev) =>
      prev.map((client) => (client.id === updated.id ? updated : client))
    );
    setEditingClient(null);
  };

  const handleReconcilePagbank = async () => {
    setReconcileLoading(true);
    setReconcileStatus(null);
    try {
      const response = await fetch("/api/pagbank/reconcile", { method: "POST" });
      if (!response.ok) {
        setReconcileStatus("Falha ao reconciliar com o PagBank.");
      } else {
        const result = await response.json();
        setReconcileStatus(
          `Conciliação concluída. Atualizadas: ${result.updated ?? 0}.`
        );
        const refreshed = await fetchDashboardData();
        setCobrancas(refreshed.cobrancas);
        setPagbankAlertas(refreshed.pagbankAlertas ?? []);
        setPagbankEventos(refreshed.pagbankEventos ?? []);
      }
    } catch {
      setReconcileStatus("Falha ao reconciliar com o PagBank.");
    } finally {
      setReconcileLoading(false);
    }
  };

  const callPrivacy = async (endpoint: string) => {
    setPrivacyLoading(true);
    setPrivacyStatus(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ client_id: privacyClientId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setPrivacyStatus(payload?.error ?? "Falha na operação LGPD.");
      } else {
        if (endpoint.endsWith("/export")) {
          const payload = await response.json();
          const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `lgpd-export-${privacyClientId}.json`;
          link.click();
          URL.revokeObjectURL(url);
          setPrivacyStatus("Exportação gerada com sucesso.");
        } else {
          const payload = await response.json().catch(() => null);
          setPrivacyStatus(payload?.message ?? "Operação concluída.");
        }
        const refreshed = await fetchDashboardData();
        setClientes(refreshed.clientes);
        setCobrancas(refreshed.cobrancas);
      }
    } catch {
      setPrivacyStatus("Falha na operação LGPD.");
    } finally {
      setPrivacyLoading(false);
    }
  };

  const handleUpdateSpecialist = async () => {
    if (!editingSpecialist) return;
    setSaveError(null);
    const updated = await updateSpecialist(editingSpecialist.id, {
      nome: editingSpecialist.nome,
      especialidade: editingSpecialist.especialidade,
      ativo: editingSpecialist.ativo,
    });
    if (!updated) {
      setSaveError("Falha ao atualizar especialista no Supabase.");
      return;
    }
    setEspecialistas((prev) =>
      prev.map((specialist) => (specialist.id === updated.id ? updated : specialist))
    );
    setEditingSpecialist(null);
  };

  const handleUpdateAppointment = async () => {
    if (!editingAppointment) return;
    setSaveError(null);
    const updated = await updateAppointment(editingAppointment.id, {
      cliente_id: editingAppointment.cliente_id,
      especialista_id: editingAppointment.especialista_id,
      data_hora: editingAppointment.data_hora,
      status: editingAppointment.status,
    });
    if (!updated) {
      setSaveError("Falha ao atualizar agendamento no Supabase.");
      return;
    }
    setAgendamentos((prev) =>
      prev.map((appointment) =>
        appointment.id === updated.id ? updated : appointment
      )
    );
    setEditingAppointment(null);
  };

  const handleUpdatePayment = async () => {
    if (!editingPayment) return;
    setSaveError(null);
    const updated = await updatePayment(editingPayment.id, {
      cliente_id: editingPayment.cliente_id,
      valor: Number(editingPayment.valor),
      status: editingPayment.status,
    });
    if (!updated) {
      setSaveError("Falha ao atualizar cobrança no Supabase.");
      return;
    }
    setCobrancas((prev) =>
      prev.map((payment) => (payment.id === updated.id ? updated : payment))
    );
    setEditingPayment(null);
  };

  const handleUpdateAtendimento = async () => {
    if (!editingAtendimento) return;
    setSaveError(null);
    const updated = await updateAtendimentoStatus(
      editingAtendimento.id,
      editingAtendimento.status
    );
    if (!updated) {
      setSaveError("Falha ao atualizar atendimento no Supabase.");
      return;
    }
    setAtendimentos((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
    setEditingAtendimento(null);
  };

  const handleLogout = async () => {
    const confirmed = window.confirm("Deseja realmente sair do sistema?");
    if (!confirmed) return;
    const client = getSupabaseClient();
    try {
      if (client) {
        // Prefer local scope to clear browser session immediately.
        await Promise.race([
          client.auth.signOut({ scope: "local" }),
          new Promise((resolve) => window.setTimeout(resolve, 3000)),
        ]);
      }
    } catch {
      // Ignore sign-out errors; we still force navigation to login.
    } finally {
      try {
        localStorage.removeItem("solara.tenant");
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key && key.startsWith("sb-")) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
      } catch {
        // Best effort cleanup.
      }
      window.location.replace("/login");
    }
  };

  const sectionMeta: Array<{ key: SectionKey; label: string }> = [
    { key: "dashboard", label: "Visão geral" },
    { key: "kanban", label: "Central Kanban" },
    { key: "clientes", label: "Clientes" },
    { key: "especialistas", label: "Especialistas" },
    { key: "agenda", label: "Agenda" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "nps", label: "NPS" },
    { key: "automacoes", label: "Automacoes" },
    { key: "privacidade", label: "Privacidade" },
    { key: "cobrancas", label: "Cobranças" },
  ] as const;

  const atendimentoColumns = ["Novo", "Em andamento", "Aguardando", "Concluído"];

  const atendimentoCounts = atendimentoColumns.reduce<Record<string, number>>((acc, status) => {
    acc[status] = atendimentos.filter((item) => item.status === status).length;
    return acc;
  }, {});

  const filaAtendimento = atendimentoColumns
    .flatMap((status) =>
      atendimentos
        .filter((item) => item.status === status)
        .map((item) => ({
          id: item.id,
          status,
          cliente: clientMap[item.cliente_id ?? ""] ?? "Sem cliente",
          canal: item.canal ?? "Canal não informado",
          criado_em: item.criado_em ?? null,
        }))
    )
    .slice(0, 6);

  const totalReceber = cobrancas.reduce(
    (total, cobranca) => total + Number(cobranca.valor || 0),
    0
  );

  const upcomingAppointments = [...agendamentos]
    .filter((item) => item.data_hora)
    .sort(
      (a, b) =>
        new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()
    )
    .slice(0, 5);

  const recentClients = [...clientes].slice(0, 5);

  return (
    <div className="app-grid">
      <aside className="sidebar">
        <div className="brand">
          <img src="/axos-hub-logo.png" alt="Axos Hub" />
        </div>
        <div className="sidebar-title">
          MÓDULO DE RECEPÇÃO DIGITAL
          <span className="sidebar-subtitle">SOLARA CONNECT</span>
        </div>
        <nav className="nav">
          {sectionMeta.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${activeSection === item.key ? "active" : ""}`}
              onClick={() => setActiveSection(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer-gap" aria-hidden="true" />
        <div className="sidebar-footer">
          <button className="logout-button" type="button" onClick={handleLogout}>
            Sair
          </button>
          <span className="sidebar-footer-text">Desenvolvido por Axos Hub.</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>Módulo de Recepção Digital</h1>
            <p>
              Clínicas médicas, odontológicas, de emagrecimento e estéticas conectadas
              em tempo real.
            </p>
            {!hasSupabaseEnv() && (
              <div className="save-error">
                Configure as variaveis NEXT_PUBLIC_SUPABASE_URL e
                NEXT_PUBLIC_SUPABASE_ANON_KEY para habilitar o banco.
              </div>
            )}
            {loading && <div className="loading">Carregando dados...</div>}
            {saveError && <div className="save-error">{saveError}</div>}
          </div>
          <div className="topbar-actions">
            {tenants.length > 0 && (
              <select
                className="select"
                value={selectedTenantId ?? ""}
                onChange={(event) => setSelectedTenantId(event.target.value || null)}
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.nome}
                  </option>
                ))}
              </select>
            )}
            <div className="solara-status">
              <div style={{ position: "relative", width: 8, height: 8, marginRight: 8 }}>
                <motion.span
                  className={`status-dot ${
                    solaraStatus?.status === "human" ? "status-dot--red" : "status-dot--green"
                  }`}
                  variants={pulseVariants}
                  animate="pulse"
                  style={{
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    zIndex: 1,
                    margin: 0,
                  }}
                />
                <span
                  className={`status-dot ${
                    solaraStatus?.status === "human" ? "status-dot--red" : "status-dot--green"
                  }`}
                  style={{ position: "relative", zIndex: 2, margin: 0 }}
                />
              </div>
              <span>
                {solaraStatus?.status === "human" ? "Solicitação humana" : "Solara atendendo"}
              </span>
              {newEventsCount > 0 && <span className="event-badge">{newEventsCount}</span>}
            </div>
            <button
              className="ghost"
              type="button"
              onClick={() =>
                handleSolaraStatus(solaraStatus?.status === "human" ? "ai" : "human")
              }
            >
              {solaraStatus?.status === "human" ? "Voltar para Solara" : "Solicitar humano"}
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => setOnboardingOpen(true)}
            >
              Configurar clinica
            </button>
            <div className="clock">{clock}</div>
            <button
              className="ghost"
              type="button"
              onClick={() => setHideMoney((prev) => !prev)}
            >
              {hideMoney ? "Mostrar valores" : "Ocultar valores"}
            </button>
            <div className="system-status">
              <span className={`status-dot ${billingStatus.color}`} />
              <div>
                <strong>{currentTenant?.nome || "C.A-SOLARA"}</strong>
                <span>{billingStatus.label}</span>
              </div>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeSection === "dashboard" && (
            <motion.div
              key="dashboard"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={containerVariants}
            >
              <motion.section className="dashboard-statusbar" variants={itemVariants}>
                <div className={`status-chip ${loading ? "status-chip--warn" : ""}`}>
                  <div style={{ position: "relative", width: 8, height: 8, marginRight: 8 }}>
                    <motion.span
                      className={`status-dot ${loading ? "status-dot--yellow" : "status-dot--green"}`}
                      variants={pulseVariants}
                      animate="pulse"
                      style={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                        zIndex: 1,
                        margin: 0,
                      }}
                    />
                    <span
                      className={`status-dot ${loading ? "status-dot--yellow" : "status-dot--green"}`}
                      style={{ position: "relative", zIndex: 2, margin: 0 }}
                    />
                  </div>
                  <div>
                    <strong>{loading ? "Conexão instável" : "Sistema online"}</strong>
                    <small>Atendimentos hoje: {atendimentos.length}</small>
                  </div>
                </div>
                <div className="status-chip">
                  <div>
                    <strong>Tempo médio de espera</strong>
                    <small>-- min</small>
                  </div>
                </div>
                <div className="status-chip">
                  <div>
                    <strong>Última atualização</strong>
                    <small>
                      {lastDashboardUpdate
                        ? formatTime(lastDashboardUpdate.toISOString())
                        : "agora"}
                    </small>
                  </div>
                </div>
              </section>

              <motion.section className="dashboard-actions" variants={itemVariants}>
                <div className="dashboard-actions-main">
                  <button
                    className="primary action-button"
                    type="button"
                    onClick={() => setAtendimentoModalOpen(true)}
                  >
                    + Novo atendimento
                  </button>
                  <button
                    className="ghost action-button"
                    type="button"
                    onClick={() => setClientModalOpen(true)}
                  >
                    + Novo paciente
                  </button>
                  <button
                    className="ghost action-button"
                    type="button"
                    onClick={() => setAgendaModalOpen(true)}
                  >
                    Agendar consulta
                  </button>
                </div>
              </section>

              <section className="grid-two">
                <motion.div className="panel" whileHover={{ y: -2 }}>
                  <div className="panel-header">
                    <h2>Fluxo de atendimento</h2>
                    <span className="chip">Operação</span>
                  </div>
                  <div className="flow-cards">
                    {atendimentoColumns.map((status) => (
                      <motion.button
                        key={status}
                        className="flow-card"
                        type="button"
                        whileHover={{ y: -4, boxShadow: "0 8px 30px rgba(0,0,0,0.12)" }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setKanbanFilter(status);
                          setActiveSection("kanban");
                        }}
                      >
                        <strong>{status}</strong>
                        <span>{atendimentoCounts[status] ?? 0}</span>
                        <small>Clique para abrir</small>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
                <motion.div className="panel" whileHover={{ y: -2 }}>
                  <div className="panel-header">
                    <h2>Fila de atendimento</h2>
                    <span className="chip">Tempo real</span>
                  </div>
                  <div className="queue-list">
                    <AnimatePresence initial={false} mode="popLayout">
                      {filaAtendimento.length === 0 ? (
                        <motion.div
                          key="empty"
                          className="queue-empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          Nenhum atendimento agora.
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => setAtendimentoModalOpen(true)}
                          >
                            Abrir atendimento
                          </button>
                        </motion.div>
                      ) : (
                        filaAtendimento.map((item) => (
                          <motion.div
                            key={item.id}
                            className="queue-item"
                            layout
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.2 }}
                          >
                            <div>
                              <strong>{item.cliente}</strong>
                              <small>
                                {item.canal} · {formatRelativeMinutes(item.criado_em)}
                              </small>
                            </div>
                            <div className="queue-actions">
                              <span className={getFilaBadge(item.status, item.criado_em)}>
                                {item.status}
                              </span>
                              <div className="queue-buttons">
                                <button
                                  className="ghost"
                                  type="button"
                                  onClick={() =>
                                    handleAtendimentoQuickAction(item.id, "Em andamento")
                                  }
                                >
                                  Atender agora
                                </button>
                                <button
                                  className="ghost"
                                  type="button"
                                  onClick={() =>
                                    handleAgendarFromAtendimento(
                                      atendimentos.find((a) => a.id === item.id)?.cliente_id ??
                                        null
                                    )
                                  }
                                >
                                  Agendar
                                </button>
                                <button
                                  className="ghost"
                                  type="button"
                                  onClick={() => handleAtendimentoQuickAction(item.id, "Concluído")}
                                >
                                  Finalizar
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              </section>

              <section className="grid-two">
                <motion.div className="panel" whileHover={{ y: -2 }}>
                  <div className="panel-header">
                    <h2>Próximos agendamentos</h2>
                    <span className="chip">Hoje</span>
                  </div>
                  <div className="data-kanban" style={{ gridTemplateColumns: "1fr" }}>
                    <div className="data-col">
                      {upcomingAppointments.length === 0 && (
                        <div className="data-card data-card--empty">
                          <strong>Nenhum agendamento hoje</strong>
                          <p>Organize o dia com um novo horário.</p>
                          <button
                            className="primary"
                            type="button"
                            onClick={() => setAgendaModalOpen(true)}
                          >
                            Agendar consulta
                          </button>
                        </div>
                      )}
                      {upcomingAppointments.map((appointment) => (
                        <div key={appointment.id} className="data-card">
                          <strong>{clientMap[appointment.cliente_id] ?? "Não informado"}</strong>
                          <p>
                            {formatDate(appointment.data_hora)} ·{" "}
                            {formatTime(appointment.data_hora)}
                          </p>
                          <span>
                            {specialistMap[appointment.especialista_id] ?? "Não informado"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
                <motion.div className="panel" whileHover={{ y: -2 }}>
                  <div className="panel-header">
                    <h2>Clientes recentes</h2>
                    <span className="chip">Novos</span>
                  </div>
                  <div className="data-kanban" style={{ gridTemplateColumns: "1fr" }}>
                    <div className="data-col">
                      {recentClients.length === 0 && (
                        <div className="data-card">Sem clientes cadastrados.</div>
                      )}
                      {recentClients.map((client) => (
                        <div key={client.id} className="data-card">
                          <strong>{client.nome}</strong>
                          <p>{client.telefone || "Sem telefone"}</p>
                          <span>Status: {client.status}</span>
                          <button
                            className="ghost"
                            type="button"
                            onClick={() => handleOpenAtendimentoForClient(client.id)}
                          >
                            Abrir atendimento
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </section>

              <section className="grid-two">
                <motion.div className="panel" whileHover={{ y: -2 }}>
                  <div className="panel-header">
                    <div>
                      <h2>Relatorio semanal</h2>
                      <p>Distribuicao de agendamentos (7 dias).</p>
                    </div>
                  </div>
                  <div className="report-grid">
                    <div
                      className="pie-chart"
                      style={{ background: buildPieGradient(weeklyReport.items) }}
                    />
                    <div className="pie-legend">
                      {weeklyReport.items.map((item) => (
                        <div key={item.label} className="legend-item">
                          <span
                            className="legend-dot"
                            style={{ background: item.color }}
                          />
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                      <div className="legend-total">
                        Total: <strong>{weeklyReport.total}</strong>
                      </div>
                    </div>
                  </div>
                </motion.div>

                <motion.div className="panel" whileHover={{ y: -2 }}>
                  <div className="panel-header">
                    <div>
                      <h2>Relatorio mensal</h2>
                      <p>Distribuicao de agendamentos (30 dias).</p>
                    </div>
                  </div>
                  <div className="report-grid">
                    <div
                      className="pie-chart"
                      style={{ background: buildPieGradient(monthlyReport.items) }}
                    />
                    <div className="pie-legend">
                      {monthlyReport.items.map((item) => (
                        <div key={item.label} className="legend-item">
                          <span
                            className="legend-dot"
                            style={{ background: item.color }}
                          />
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                      <div className="legend-total">
                        Total: <strong>{monthlyReport.total}</strong>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </section>
            </motion.div>
          )}

          {activeSection === "kanban" && (
            <motion.div
              key="kanban"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <section className="panel">
            <div className="panel-header">
              <h2>Central Kanban</h2>
              <div className="panel-actions">
                <select
                  className="select"
                  value={kanbanFilter}
                  onChange={(event) => setKanbanFilter(event.target.value)}
                >
                  <option value="Todos">Todos</option>
                  {atendimentoColumns.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <button
                  className="ghost"
                  onClick={() =>
                    exportCsv(
                      "atendimentos.csv",
                      filteredAtendimentos.map((item) => ({
                        cliente: clientMap[item.cliente_id ?? ""] ?? "Sem cliente",
                        status: item.status,
                        canal: item.canal ?? "",
                        responsável: item.responsavel ?? "",
                      }))
                    )
                  }
                  type="button"
                >
                  Exportar CSV
                </button>
                <button
                  className="primary"
                  onClick={() => setAtendimentoModalOpen(true)}
                  type="button"
                >
                  Novo atendimento
                </button>
              </div>
            </div>

            <div className="kanban">
              {atendimentoColumns.map((status) => (
                <div
                  key={status}
                  className={`kanban-col ${
                    dragOverStatus === status ? "kanban-col--active" : ""
                  }`}
                  onDragOver={(event) => handleKanbanDragOver(event, status)}
                  onDragLeave={() => setDragOverStatus(null)}
                  onDrop={(event) => handleKanbanDrop(event, status)}
                >
                  <h3>{status}</h3>
                  {filteredAtendimentos
                    .filter((item) => item.status === status)
                    .map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        className={`kanban-card clickable ${
                          draggingAtendimentoId === item.id ? "is-dragging" : ""
                        }`}
                        onClick={() => setEditingAtendimento(item)}
                        draggable
                        onDragStart={(event) => handleKanbanDragStart(event, item.id)}
                        onDragEnd={() => setDraggingAtendimentoId(null)}
                      >
                        <strong>{clientMap[item.cliente_id ?? ""] ?? "Sem cliente"}</strong>
                        <span>Canal: {item.canal ?? "Não informado"}</span>
                        <span>Resp: {item.responsavel ?? "Equipe"}</span>
                      </motion.div>
                    ))}
                </div>
              ))}
            </div>
              </section>
            </motion.div>
          )}

          {activeSection === "clientes" && (
            <motion.div
              key="clientes"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <section className="panel">
            <div className="panel-header">
              <h2>Clientes</h2>
              <div className="panel-actions">
                <select
                  className="select"
                  value={clientFilter}
                  onChange={(event) => setClientFilter(event.target.value)}
                >
                  <option value="Todos">Todos</option>
                  <option value="Novo">Novo</option>
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </select>
                <button
                  className="ghost"
                  onClick={() =>
                    exportCsv(
                      "clientes.csv",
                      filteredClientes.map((client) => ({
                        nome: client.nome,
                        telefone: client.telefone,
                        status: client.status,
                      }))
                    )
                  }
                  type="button"
                >
                  Exportar CSV
                </button>
                <button
                  className="primary"
                  onClick={() => setClientModalOpen(true)}
                  type="button"
                >
                  Novo cliente
                </button>
              </div>
            </div>

            <div className="data-kanban">
              {["Novo", "Ativo", "Inativo"].map((status) => (
                <div key={status} className="data-col">
                  <h3>{status}</h3>
                  {filteredClientes
                    .filter((client) => client.status === status)
                    .map((client) => (
                      <div
                        key={client.id}
                        className="data-card clickable"
                        onClick={() => setEditingClient(client)}
                      >
                        <strong>{client.nome}</strong>
                        <p>{client.telefone || "Sem telefone"}</p>
                        <p>{client.email || "Sem email"}</p>
                        <p>{client.tax_id || "CPF/CNPJ nao informado"}</p>
                        <span>Status: {client.status}</span>
                      </div>
                    ))}
                </div>
              ))}
            </div>
              </section>
            </motion.div>
          )}

          {activeSection === "especialistas" && (
            <motion.div
              key="especialistas"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <section className="panel">
            <div className="panel-header">
              <h2>Especialistas</h2>
              <div className="panel-actions">
                <select
                  className="select"
                  value={specialistFilter}
                  onChange={(event) => setSpecialistFilter(event.target.value)}
                >
                  <option value="Todos">Todos</option>
                  <option value="Ativos">Ativos</option>
                  <option value="Inativos">Inativos</option>
                </select>
                <button
                  className="ghost"
                  onClick={() =>
                    exportCsv(
                      "especialistas.csv",
                      filteredEspecialistas.map((specialist) => ({
                        nome: specialist.nome,
                        especialidade: specialist.especialidade,
                        ativo: specialist.ativo ? "Ativo" : "Inativo",
                      }))
                    )
                  }
                  type="button"
                >
                  Exportar CSV
                </button>
                <button
                  className="primary"
                  onClick={() => setSpecialistModalOpen(true)}
                  type="button"
                >
                  Novo especialista
                </button>
              </div>
            </div>

            <div className="data-kanban">
              {[
                { label: "Ativos", key: true },
                { label: "Inativos", key: false },
              ].map((col) => (
                <div key={col.label} className="data-col">
                  <h3>{col.label}</h3>
                  {filteredEspecialistas
                    .filter((specialist) => specialist.ativo === col.key)
                    .map((specialist) => (
                      <div
                        key={specialist.id}
                        className="data-card clickable"
                        onClick={() => setEditingSpecialist(specialist)}
                      >
                        <strong>{specialist.nome}</strong>
                        <p>{specialist.especialidade}</p>
                        <span>{specialist.ativo ? "Ativo" : "Inativo"}</span>
                      </div>
                    ))}
                </div>
              ))}
            </div>
              </section>
            </motion.div>
          )}

          {activeSection === "agenda" && (
            <motion.div
              key="agenda"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <section className="panel">
            <div className="panel-header">
              <h2>Agenda</h2>
              <div className="panel-actions">
                <select
                  className="select"
                  value={agendaFilter}
                  onChange={(event) => setAgendaFilter(event.target.value)}
                >
                  <option value="Todos">Todos</option>
                  {agendaStatusList.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <button
                  className="ghost"
                  onClick={() =>
                    exportCsv(
                      "agenda.csv",
                      filteredAgendamentos.map((appointment) => ({
                        nome: clientMap[appointment.cliente_id] ?? "Não informado",
                        data: formatDate(appointment.data_hora),
                        horário: formatTime(appointment.data_hora),
                        especialista: specialistMap[appointment.especialista_id] ?? "Não informado",
                        status: appointment.status,
                      }))
                    )
                  }
                  type="button"
                >
                  Exportar CSV
                </button>
                <button
                  className="primary"
                  onClick={() => setAgendaModalOpen(true)}
                  type="button"
                >
                  Novo agendamento
                </button>
              </div>
            </div>

            <div className="agenda-kanban">
              {agendaStatusList.map((status) => (
                <div key={status} className="agenda-col">
                  <h3>{status}</h3>
                  {filteredAgendamentos
                    .filter((appointment) => appointment.status === status)
                    .map((appointment) => (
                      <div
                        key={appointment.id}
                        className="agenda-card clickable"
                        onClick={() => setEditingAppointment(appointment)}
                      >
                        <strong>
                          {clientMap[appointment.cliente_id] ?? "Não informado"}
                        </strong>
                        <p>
                          {formatDate(appointment.data_hora)} ·{" "}
                          {formatTime(appointment.data_hora)}
                        </p>
                        <span>
                          {specialistMap[appointment.especialista_id] ?? "Não informado"}
                        </span>
                      </div>
                    ))}
                </div>
              ))}
            </div>
              </section>
            </motion.div>
          )}

          {activeSection === "cobrancas" && (
            <motion.div
              key="cobrancas"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <section className="panel">
            <div className="panel-header">
              <h2>Cobranças</h2>
              <div className="panel-actions">
                <select
                  className="select"
                  value={paymentFilter}
                  onChange={(event) => setPaymentFilter(event.target.value)}
                >
                  <option value="Todos">Todos</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Pago">Pago</option>
                  <option value="Atrasado">Atrasado</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
                <button
                  className="ghost"
                  onClick={() =>
                    exportCsv(
                      "cobrancas.csv",
                      filteredCobrancas.map((payment) => ({
                        cliente: clientMap[payment.cliente_id] ?? "Não informado",
                        valor: hideMoney ? "R$ ••••" : payment.valor,
                        status: payment.status,
                      }))
                    )
                  }
                  type="button"
                >
                  Exportar CSV
                </button>
                <button
                  className="ghost"
                  onClick={handleReconcilePagbank}
                  type="button"
                  disabled={reconcileLoading}
                >
                  {reconcileLoading ? "Conciliando..." : "Reconciliar PagBank"}
                </button>
                <button
                  className="primary"
                  onClick={() => setPaymentModalOpen(true)}
                  type="button"
                >
                  Nova cobrança
                </button>
                <button
                  className="ghost"
                  onClick={() => setHideMoney((prev) => !prev)}
                  type="button"
                >
                  {hideMoney ? "Mostrar valores" : "Ocultar valores"}
                </button>
              </div>
            </div>
            {reconcileStatus ? <p className="solara-empty">{reconcileStatus}</p> : null}

            <section className="grid-two">
              <div className="panel">
                <div className="panel-header">
                  <h2>Conciliação PagBank</h2>
                  <span className="chip">Hoje</span>
                </div>
                <div className="chart">
                  <div className="chart-row">
                    <span>Sem PIX</span>
                    <div className="bar">
                      <span
                        style={{
                          width: `${Math.min(cobrancasSemPagbank.length * 20, 100)}%`,
                        }}
                      />
                    </div>
                    <strong>{cobrancasSemPagbank.length}</strong>
                  </div>
                  <div className="chart-row">
                    <span>Divergentes</span>
                    <div className="bar">
                      <span
                        style={{
                          width: `${Math.min(cobrancasDivergentes.length * 20, 100)}%`,
                        }}
                      />
                    </div>
                    <strong>{cobrancasDivergentes.length}</strong>
                  </div>
                </div>
                {cobrancasDivergentes.slice(0, 5).map((payment) => (
                  <div key={payment.id} className="report-grid">
                    <span>{clientMap[payment.cliente_id] ?? "Não informado"}</span>
                    <span>
                      {payment.status} · {payment.pagbank_status ?? "sem status"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2>Financeiro PagBank</h2>
                  <span className="chip">Taxas</span>
                </div>
                <div className="chart">
                  <div className="chart-row">
                    <span>Taxas</span>
                    <div className="bar">
                      <span
                        style={{
                          width: `${hideMoney ? 0 : Math.min(totalFees * 2, 100)}%`,
                        }}
                      />
                    </div>
                    <strong>{formatMoney(totalFees, hideMoney)}</strong>
                  </div>
                  <div className="chart-row">
                    <span>Líquido</span>
                    <div className="bar">
                      <span
                        style={{
                          width: `${hideMoney ? 0 : Math.min(totalNet * 2, 100)}%`,
                        }}
                      />
                    </div>
                    <strong>{formatMoney(totalNet, hideMoney)}</strong>
                  </div>
                </div>
                {cobrancasComTaxas.length === 0 ? (
                  <p className="solara-empty">Sem taxas calculadas ainda.</p>
                ) : null}
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2>Alertas PagBank</h2>
                  <span className="chip">Últimos</span>
                </div>
                {pagbankAlertas.length === 0 ? (
                  <p className="solara-empty">Sem alertas recentes.</p>
                ) : (
                  pagbankAlertas.slice(0, 5).map((alert) => (
                    <div key={alert.id} className="report-grid">
                      <span>{alert.type}</span>
                      <span>
                        {formatDate(alert.created_at ?? "")}
                        {alert.notify_channel ? ` · ${alert.notify_channel}` : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <div className="data-kanban">
              {["Pendente", "Pago", "Atrasado", "Cancelado"].map((status) => (
                <div key={status} className="data-col">
                  <h3>{status}</h3>
                  {filteredCobrancas
                    .filter((payment) => payment.status === status)
                    .map((payment) => (
                      <div
                        key={payment.id}
                        className="data-card clickable"
                        onClick={() => setEditingPayment(payment)}
                      >
                        <strong>{clientMap[payment.cliente_id] ?? "Não informado"}</strong>
                        <p>{formatMoney(Number(payment.valor), hideMoney)}</p>
                        <span>Status: {payment.status}</span>
                      </div>
                    ))}
                </div>
              ))}
            </div>
              </section>
            </motion.div>
          )}

          {activeSection === "whatsapp" && (
            <motion.div
              key="whatsapp"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <section className="panel whatsapp-shell">
                <div className="panel-header">
                  <h2>WhatsApp da clínica</h2>
                  <div className="panel-actions">
                    <button
                      className="ghost"
                      type="button"
                      onClick={handleClearWhatsAppConversation}
                      disabled={clearConversationLoading}
                    >
                      {clearConversationLoading ? "Limpando..." : "Limpar conversa"}
                    </button>
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => handleSolaraStatus("human")}
                    >
                      Assumir humano
                    </button>
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => handleSolaraStatus("ai")}
                    >
                      Retornar para IA
                    </button>
                  </div>
                </div>

                <div className="whatsapp-connection-select">
                  <label>
                    Clínica / Instância
                    <select
                      className="select"
                      value={selectedConexaoId ?? ""}
                      onChange={(event) => setSelectedConexaoId(event.target.value || null)}
                    >
                      {conexoes.length === 0 ? (
                        <option value="">Nenhuma conexão cadastrada</option>
                      ) : null}
                      {conexoes.map((conexao) => (
                        <option key={conexao.id} value={conexao.id}>
                          {conexao.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="whatsapp-chat-layout">
                  <aside className="whatsapp-conversations">
                    <div className="whatsapp-conversations-header">
                      <strong>Conversas</strong>
                      <span>{whatsappConversations.length}</span>
                    </div>
                    <div className="whatsapp-conversations-list">
                      {whatsappConversations.length === 0 ? (
                        <p className="solara-empty">Nenhuma conversa nesta instância.</p>
                      ) : (
                        whatsappConversations.map((thread) => (
                          <button
                            key={thread.id}
                            type="button"
                            className={`whatsapp-thread-item ${
                              selectedWhatsAppConversation?.id === thread.id ? "active" : ""
                            }`}
                            onClick={() => setSelectedWhatsAppThread(thread.id)}
                          >
                            <strong>{thread.label}</strong>
                            <span>{thread.phone || "Sem número"}</span>
                            <small>{thread.lastMessage}</small>
                          </button>
                        ))
                      )}
                    </div>
                  </aside>

                  <div className="whatsapp-attendant">
                    <div className="whatsapp-clinic-strip">
                      <div className="clinic-pill">
                        <small>Clínica</small>
                        <strong>{selectedConexao?.nome ?? currentTenant?.nome ?? "Não configurada"}</strong>
                      </div>
                      <div className="clinic-pill">
                        <small>WhatsApp</small>
                        <strong>{selectedConexao?.telefone ?? "--"}</strong>
                      </div>
                      <div className="clinic-pill">
                        <small>Instância</small>
                        <strong>{selectedConexao?.instance_id ?? "--"}</strong>
                      </div>
                    </div>

                    <div className="whatsapp-chat-header">
                      <div className="whatsapp-chat-user">
                        <div className="whatsapp-chat-avatar">
                          {(sendClientName.trim() || "C").slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <strong>
                            {selectedWhatsAppConversation
                              ? sendClientName.trim() || "Cliente sem nome"
                              : "Nenhum cliente selecionado"}
                          </strong>
                          <span>
                            {selectedWhatsAppConversation?.phone
                              ? selectedWhatsAppConversation.phone
                              : "Sem número"}
                          </span>
                        </div>
                      </div>
                      <div className="whatsapp-chat-meta">Canal: WhatsApp</div>
                    </div>

                    <div className="whatsapp-chat-card">
                      <div className="whatsapp-thread" ref={whatsappBodyRef}>
                        {!selectedWhatsAppConversation ? (
                          <p className="solara-empty">
                            Nenhuma conversa ainda para esta instância.
                          </p>
                        ) : (
                          selectedWhatsAppConversation.messages.map((evento) => {
                            const direction = extractEventDirection(evento);
                            const clientLabel = extractEventClientLabel(evento);
                            return (
                              <div key={evento.id} className={`whatsapp-bubble ${direction}`}>
                                <strong className="whatsapp-bubble-author">
                                  {direction === "out" ? "Clínica" : clientLabel}
                                </strong>
                                <p>{extractWhatsAppEventText(evento)}</p>
                                <small>
                                  {(evento.event ?? "evento").replaceAll(".", " / ")} •{" "}
                                  {evento.criado_em
                                    ? `${formatDate(evento.criado_em)} ${formatTime(
                                        evento.criado_em
                                      )}`
                                    : "--"}
                                </small>
                                {(mediaUrls[evento.id] ?? evento.media_url) &&
                                evento.media_type === "image" ? (
                                  <img
                                    className="event-media-image"
                                    src={mediaUrls[evento.id] ?? evento.media_url ?? ""}
                                    alt="Imagem recebida"
                                  />
                                ) : null}
                                {(mediaUrls[evento.id] ?? evento.media_url) &&
                                evento.media_type === "audio" ? (
                                  <audio
                                    className="event-media-audio"
                                    controls
                                    src={mediaUrls[evento.id] ?? evento.media_url ?? ""}
                                  />
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="whatsapp-compose">
                        <form
                          className="whatsapp-compose-form"
                          onSubmit={handleWhatsAppComposeSubmit}
                        >
                          <textarea
                            className="input whatsapp-message-input"
                            rows={3}
                            placeholder="Digite uma mensagem"
                            value={sendText}
                            onChange={(event) => setSendText(event.target.value)}
                            onKeyDown={handleWhatsAppMessageKeyDown}
                          />
                          <div className="whatsapp-compose-row">
                            <input
                              className="input"
                              placeholder="Nome do cliente"
                              value={sendClientName}
                              onChange={(event) => setSendClientName(event.target.value)}
                            />
                            <input
                              className="input"
                              placeholder="Número do cliente"
                              value={sendTarget}
                              onChange={(event) => setSendTarget(event.target.value)}
                            />
                            <button className="primary whatsapp-send-button" type="submit">
                              Enviar
                            </button>
                          </div>
                        </form>
                        {sendStatus ? <div className="save-error">{sendStatus}</div> : null}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </motion.div>
          )}

          {activeSection === "nps" && (
            <motion.div
              key="nps"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>NPS</h2>
                    <p>Feedback das consultas das clinicas.</p>
                  </div>
                  <div className="panel-actions">
                    <button
                      className="ghost"
                      type="button"
                      onClick={() =>
                        exportCsv(
                          "nps.csv",
                          filteredNps.map((row) => ({
                            cliente: row.cliente_id ? clientMap[row.cliente_id] : "Sem cliente",
                            nota: row.nota ?? "",
                            comentario: row.comentario ?? "",
                            enviada_em: row.enviada_em ?? row.criado_em ?? "",
                            respondida_em: row.respondida_em ?? "",
                          }))
                        )
                      }
                    >
                      Exportar CSV
                    </button>
                  </div>
                </div>

                <div className="table">
                  {filteredNps.length === 0 ? (
                    <p className="solara-empty">Nenhum NPS registrado ainda.</p>
                  ) : (
                    filteredNps.map((row) => (
                      <div key={row.id} className="row">
                        <div>
                          <strong>
                            {row.cliente_id ? clientMap[row.cliente_id] : "Sem cliente"}
                          </strong>
                          <span>
                            Enviado: {formatDate(row.enviada_em ?? row.criado_em ?? "")}
                          </span>
                        </div>
                        <div className="row-meta">
                          <span className={`status ${row.nota ? "pago" : "pendente"}`}>
                            {row.nota ?? "Pendente"}
                          </span>
                          <span>
                            Respondido: {formatDate(row.respondida_em ?? "")}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {activeSection === "automacoes" && (
            <motion.div
              key="automacoes"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Automacoes da Solara</h2>
                    <p>Edite regras e mensagens por clinica.</p>
                  </div>
                  <div className="panel-actions">
                    <button
                      className="primary"
                      type="button"
                      onClick={handleSaveAutomation}
                      disabled={automationSaving}
                    >
                      {automationSaving ? "Salvando..." : "Salvar alteracoes"}
                    </button>
                  </div>
                </div>

                {automationLoading ? (
                  <p className="solara-empty">Carregando configuracoes...</p>
                ) : (
                  <div className="panel-body">
                    <label>
                      Auto-resposta da Solara no WhatsApp
                      <input
                        type="checkbox"
                        checked={Boolean(automationDraft.auto_reply_enabled)}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            auto_reply_enabled: event.target.checked,
                          }))
                        }
                      />
                    </label>

                    <label>
                      NPS ativo
                      <input
                        type="checkbox"
                        checked={Boolean(automationDraft.nps_enabled)}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            nps_enabled: event.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Mensagem NPS
                      <textarea
                        className="input"
                        rows={3}
                        value={automationDraft.nps_message ?? ""}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            nps_message: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label>
                      Aniversario ativo
                      <input
                        type="checkbox"
                        checked={Boolean(automationDraft.birthday_enabled)}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            birthday_enabled: event.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Mensagem de aniversario
                      <textarea
                        className="input"
                        rows={2}
                        value={automationDraft.birthday_message ?? ""}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            birthday_message: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label>
                      Natal ativo
                      <input
                        type="checkbox"
                        checked={Boolean(automationDraft.christmas_enabled)}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            christmas_enabled: event.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Mensagem de Natal
                      <textarea
                        className="input"
                        rows={2}
                        value={automationDraft.christmas_message ?? ""}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            christmas_message: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label>
                      Ano Novo ativo
                      <input
                        type="checkbox"
                        checked={Boolean(automationDraft.newyear_enabled)}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            newyear_enabled: event.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Mensagem de Ano Novo
                      <textarea
                        className="input"
                        rows={2}
                        value={automationDraft.newyear_message ?? ""}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            newyear_message: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label>
                      Follow-up 7 dias ativo
                      <input
                        type="checkbox"
                        checked={Boolean(automationDraft.followup_7d_enabled)}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            followup_7d_enabled: event.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Mensagem follow-up 7 dias
                      <textarea
                        className="input"
                        rows={2}
                        value={automationDraft.followup_7d_message ?? ""}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            followup_7d_message: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label>
                      Follow-up 11 meses ativo
                      <input
                        type="checkbox"
                        checked={Boolean(automationDraft.followup_11m_enabled)}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            followup_11m_enabled: event.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Mensagem follow-up 11 meses
                      <textarea
                        className="input"
                        rows={2}
                        value={automationDraft.followup_11m_message ?? ""}
                        onChange={(event) =>
                          setAutomationDraft((prev) => ({
                            ...prev,
                            followup_11m_message: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <p className="solara-empty">
                      Variaveis disponiveis: {"{cliente}"} {"{clinica}"} {"{ano}"}
                    </p>
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {activeSection === "privacidade" && (
            <motion.div
              key="privacidade"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <section className="panel">
                <div className="panel-header">
                  <h2>LGPD · Direitos do Titular</h2>
                  <span className="chip">Admin</span>
                </div>
                <label>
                  Cliente
                  <select
                    className="select"
                    value={privacyClientId}
                    onChange={(event) => setPrivacyClientId(event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {clientes.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="panel-actions">
                  <button
                    className="ghost"
                    type="button"
                    disabled={!privacyClientId || privacyLoading}
                    onClick={() => callPrivacy("/api/privacy/export")}
                  >
                    Exportar dados
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    disabled={!privacyClientId || privacyLoading}
                    onClick={() => callPrivacy("/api/privacy/anonymize")}
                  >
                    Anonimizar
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    disabled={!privacyClientId || privacyLoading}
                    onClick={() => callPrivacy("/api/privacy/delete")}
                  >
                    Excluir
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    disabled={privacyLoading}
                    onClick={() => callPrivacy("/api/privacy/retention")}
                  >
                    Retenção
                  </button>
                </div>
                {privacyStatus ? <p className="solara-empty">{privacyStatus}</p> : null}
              </section>
            </motion.div>
          )}
        </AnimatePresence>

        <Modal
          open={clientModalOpen}
          title="Cadastrar cliente"
          onClose={() => setClientModalOpen(false)}
          footer={
            <button className="primary" onClick={handleCreateClient} type="button">
              Salvar cliente
            </button>
          }
        >
          <label>
            Nome
            <input
              className="input"
              value={newClient.nome}
              onChange={(event) => setNewClient({ ...newClient, nome: event.target.value })}
            />
          </label>
          <label>
            Telefone
            <input
              className="input"
              value={newClient.telefone}
              onChange={(event) =>
                setNewClient({ ...newClient, telefone: event.target.value })
              }
            />
          </label>
          <label>
            Email
            <input
              className="input"
              type="email"
              value={newClient.email}
              onChange={(event) => setNewClient({ ...newClient, email: event.target.value })}
            />
          </label>
          <label>
            CPF/CNPJ
            <input
              className="input"
              value={newClient.tax_id}
              onChange={(event) => setNewClient({ ...newClient, tax_id: event.target.value })}
            />
          </label>
          <label>
            Status
            <select
              className="select"
              value={newClient.status}
              onChange={(event) => setNewClient({ ...newClient, status: event.target.value })}
            >
              <option value="Novo">Novo</option>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
            </select>
          </label>
        </Modal>

        <Modal
          open={specialistModalOpen}
          title="Cadastrar especialista"
          onClose={() => setSpecialistModalOpen(false)}
          footer={
            <button className="primary" onClick={handleCreateSpecialist} type="button">
              Salvar especialista
            </button>
          }
        >
          <label>
            Nome
            <input
              className="input"
              value={newSpecialist.nome}
              onChange={(event) =>
                setNewSpecialist({ ...newSpecialist, nome: event.target.value })
              }
            />
          </label>
          <label>
            Especialidade
            <input
              className="input"
              value={newSpecialist.especialidade}
              onChange={(event) =>
                setNewSpecialist({ ...newSpecialist, especialidade: event.target.value })
              }
            />
          </label>
          <label>
            Ativo
            <select
              className="select"
              value={newSpecialist.ativo ? "true" : "false"}
              onChange={(event) =>
                setNewSpecialist({ ...newSpecialist, ativo: event.target.value === "true" })
              }
            >
              <option value="true">Sim</option>
              <option value="false">Nao</option>
            </select>
          </label>
        </Modal>

        <Modal
          open={agendaModalOpen}
          title="Novo agendamento"
          onClose={() => setAgendaModalOpen(false)}
          footer={
            <button className="primary" onClick={handleCreateAppointment} type="button">
              Salvar agendamento
            </button>
          }
        >
          <label>
            Cliente
            <select
              className="select"
              value={newAppointment.cliente_id}
              onChange={(event) =>
                setNewAppointment({ ...newAppointment, cliente_id: event.target.value })
              }
            >
              <option value="">Selecione</option>
              {clientes.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Especialista
            <select
              className="select"
              value={newAppointment.especialista_id}
              onChange={(event) =>
                setNewAppointment({ ...newAppointment, especialista_id: event.target.value })
              }
            >
              <option value="">Selecione</option>
              {especialistas.map((specialist) => (
                <option key={specialist.id} value={specialist.id}>
                  {specialist.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data
            <input
              type="date"
              className="input"
              value={newAppointment.data}
              onChange={(event) =>
                setNewAppointment({ ...newAppointment, data: event.target.value })
              }
            />
          </label>
          <label>
            Horário
            <input
              type="time"
              className="input"
              value={newAppointment.hora}
              onChange={(event) =>
                setNewAppointment({ ...newAppointment, hora: event.target.value })
              }
            />
          </label>
          <label>
            Status
            <select
              className="select"
              value={newAppointment.status}
              onChange={(event) =>
                setNewAppointment({ ...newAppointment, status: event.target.value })
              }
            >
              {agendaStatusList.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </Modal>

        <Modal
          open={paymentModalOpen}
          title="Nova cobrança"
          onClose={() => setPaymentModalOpen(false)}
          footer={
            <button className="primary" onClick={handleCreatePayment} type="button">
              Salvar cobrança
            </button>
          }
        >
          <label>
            Cliente
            <select
              className="select"
              value={newPayment.cliente_id}
              onChange={(event) =>
                setNewPayment({ ...newPayment, cliente_id: event.target.value })
              }
            >
              <option value="">Selecione</option>
              {clientes.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Valor
            <input
              className="input"
              value={newPayment.valor}
              onChange={(event) => setNewPayment({ ...newPayment, valor: event.target.value })}
            />
          </label>
          <label>
            Status
            <select
              className="select"
              value={newPayment.status}
              onChange={(event) =>
                setNewPayment({ ...newPayment, status: event.target.value })
              }
            >
              <option value="Pendente">Pendente</option>
              <option value="Pago">Pago</option>
              <option value="Atrasado">Atrasado</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </label>
        </Modal>

        <Modal
          open={pixModalOpen}
          title="PIX gerado"
          onClose={() => setPixModalOpen(false)}
          footer={
            <button
              className="primary"
              type="button"
              onClick={async () => {
                if (!pixPayload?.qrCodeText) return;
                try {
                  await navigator.clipboard.writeText(pixPayload.qrCodeText);
                  setPixCopyStatus("Código PIX copiado.");
                } catch {
                  setPixCopyStatus("Não foi possível copiar o código PIX.");
                }
              }}
            >
              Copiar código PIX
            </button>
          }
        >
          <p>
            Pedido: <strong>{pixPayload?.orderId ?? "--"}</strong>
          </p>
          <label>
            Código PIX
            <textarea
              className="input"
              rows={4}
              readOnly
              value={pixPayload?.qrCodeText ?? ""}
            />
          </label>
          {pixPayload?.qrCodeImageUrl ? (
            <a
              className="ghost"
              href={pixPayload.qrCodeImageUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir imagem do QR Code
            </a>
          ) : null}
          {pixCopyStatus ? <span>{pixCopyStatus}</span> : null}
        </Modal>

        <Modal
          open={atendimentoModalOpen}
          title="Novo atendimento"
          onClose={() => setAtendimentoModalOpen(false)}
          footer={
            <button className="primary" onClick={handleCreateAtendimento} type="button">
              Salvar atendimento
            </button>
          }
        >
          <label>
            Cliente
            <select
              className="select"
              value={newAtendimento.cliente_id}
              onChange={(event) =>
                setNewAtendimento({ ...newAtendimento, cliente_id: event.target.value })
              }
            >
              <option value="">Sem cliente</option>
              {clientes.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              className="select"
              value={newAtendimento.status}
              onChange={(event) =>
                setNewAtendimento({ ...newAtendimento, status: event.target.value })
              }
            >
              {atendimentoColumns.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Canal
            <input
              className="input"
              value={newAtendimento.canal}
              onChange={(event) =>
                setNewAtendimento({ ...newAtendimento, canal: event.target.value })
              }
            />
          </label>
          <label>
            Responsável
            <input
              className="input"
              value={newAtendimento.responsavel}
              onChange={(event) =>
                setNewAtendimento({ ...newAtendimento, responsavel: event.target.value })
              }
            />
          </label>
        </Modal>

        <Modal
          open={Boolean(editingClient)}
          title="Editar cliente"
          onClose={() => setEditingClient(null)}
          footer={
            <button className="primary" onClick={handleUpdateClient} type="button">
              Atualizar cliente
            </button>
          }
        >
          {editingClient && (
            <>
              <label>
                Nome
                <input
                  className="input"
                  value={editingClient.nome}
                  onChange={(event) =>
                    setEditingClient({ ...editingClient, nome: event.target.value })
                  }
                />
              </label>
              <label>
                Telefone
                <input
                  className="input"
                  value={editingClient.telefone}
                  onChange={(event) =>
                    setEditingClient({ ...editingClient, telefone: event.target.value })
                  }
                />
              </label>
              <label>
                Email
                <input
                  className="input"
                  type="email"
                  value={editingClient.email ?? ""}
                  onChange={(event) =>
                    setEditingClient({ ...editingClient, email: event.target.value })
                  }
                />
              </label>
              <label>
                CPF/CNPJ
                <input
                  className="input"
                  value={editingClient.tax_id ?? ""}
                  onChange={(event) =>
                    setEditingClient({ ...editingClient, tax_id: event.target.value })
                  }
                />
              </label>
              <label>
                Status
                <select
                  className="select"
                  value={editingClient.status}
                  onChange={(event) =>
                    setEditingClient({ ...editingClient, status: event.target.value })
                  }
                >
                  <option value="Novo">Novo</option>
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </label>
            </>
          )}
        </Modal>

        <Modal
          open={Boolean(editingSpecialist)}
          title="Editar especialista"
          onClose={() => setEditingSpecialist(null)}
          footer={
            <button className="primary" onClick={handleUpdateSpecialist} type="button">
              Atualizar especialista
            </button>
          }
        >
          {editingSpecialist && (
            <>
              <label>
                Nome
                <input
                  className="input"
                  value={editingSpecialist.nome}
                  onChange={(event) =>
                    setEditingSpecialist({
                      ...editingSpecialist,
                      nome: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Especialidade
                <input
                  className="input"
                  value={editingSpecialist.especialidade}
                  onChange={(event) =>
                    setEditingSpecialist({
                      ...editingSpecialist,
                      especialidade: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Ativo
                <select
                  className="select"
                  value={editingSpecialist.ativo ? "true" : "false"}
                  onChange={(event) =>
                    setEditingSpecialist({
                      ...editingSpecialist,
                      ativo: event.target.value === "true",
                    })
                  }
                >
                  <option value="true">Sim</option>
                  <option value="false">Nao</option>
                </select>
              </label>
            </>
          )}
        </Modal>

        <Modal
          open={Boolean(editingAppointment)}
          title="Editar agendamento"
          onClose={() => setEditingAppointment(null)}
          footer={
            <button className="primary" onClick={handleUpdateAppointment} type="button">
              Atualizar agendamento
            </button>
          }
        >
          {editingAppointment && (
            <>
              <label>
                Cliente
                <select
                  className="select"
                  value={editingAppointment.cliente_id}
                  onChange={(event) =>
                    setEditingAppointment({
                      ...editingAppointment,
                      cliente_id: event.target.value,
                    })
                  }
                >
                  {clientes.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Especialista
                <select
                  className="select"
                  value={editingAppointment.especialista_id}
                  onChange={(event) =>
                    setEditingAppointment({
                      ...editingAppointment,
                      especialista_id: event.target.value,
                    })
                  }
                >
                  {especialistas.map((specialist) => (
                    <option key={specialist.id} value={specialist.id}>
                      {specialist.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Data e horário
                <input
                  className="input"
                  type="datetime-local"
                  value={editingAppointment.data_hora.slice(0, 16)}
                  onChange={(event) =>
                    setEditingAppointment({
                      ...editingAppointment,
                      data_hora: `${event.target.value}:00`,
                    })
                  }
                />
              </label>
              <label>
                Status
                <select
                  className="select"
                  value={editingAppointment.status}
                  onChange={(event) =>
                    setEditingAppointment({
                      ...editingAppointment,
                      status: event.target.value,
                    })
                  }
                >
                  {agendaStatusList.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </Modal>

        <Modal
          open={Boolean(editingPayment)}
          title="Editar cobrança"
          onClose={() => setEditingPayment(null)}
          footer={
            <button className="primary" onClick={handleUpdatePayment} type="button">
              Atualizar cobrança
            </button>
          }
        >
          {editingPayment && (
            <>
              <label>
                Cliente
                <select
                  className="select"
                  value={editingPayment.cliente_id}
                  onChange={(event) =>
                    setEditingPayment({
                      ...editingPayment,
                      cliente_id: event.target.value,
                    })
                  }
                >
                  {clientes.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Valor
                <input
                  className="input"
                  value={editingPayment.valor}
                  onChange={(event) =>
                    setEditingPayment({
                      ...editingPayment,
                      valor: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Status
                <select
                  className="select"
                  value={editingPayment.status}
                  onChange={(event) =>
                    setEditingPayment({
                      ...editingPayment,
                      status: event.target.value,
                    })
                  }
                >
                  <option value="Pendente">Pendente</option>
                  <option value="Pago">Pago</option>
                  <option value="Atrasado">Atrasado</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              </label>
              <button
                className="ghost"
                type="button"
                onClick={() => setPagbankDetailsOpen(true)}
              >
                Ver detalhes PagBank
              </button>
            </>
          )}
        </Modal>

        <Modal
          open={pagbankDetailsOpen && Boolean(editingPayment)}
          title="Detalhes PagBank"
          onClose={() => setPagbankDetailsOpen(false)}
        >
          {editingPayment && (
            <>
              {pagbankEventos
                .filter(
                  (evento) =>
                    evento.reference_id === editingPayment.id ||
                    evento.order_id === editingPayment.pagbank_order_id
                )
                .slice(0, 5)
                .map((evento) => (
                  <div key={evento.id} className="report-grid">
                    <span>{evento.status ?? "Evento"}</span>
                    <span>{formatDate(evento.created_at ?? "")}</span>
                  </div>
                ))}
              <p>
                Pedido: <strong>{editingPayment.pagbank_order_id ?? "--"}</strong>
              </p>
              <p>
                Status PagBank:{" "}
                <strong>{editingPayment.pagbank_status ?? "Não informado"}</strong>
              </p>
              <p>
                Atualizado em:{" "}
                <strong>
                  {editingPayment.pagbank_updated_at
                    ? formatDate(editingPayment.pagbank_updated_at)
                    : "--"}
                </strong>
              </p>
              <p>
                Expira em:{" "}
                <strong>
                  {editingPayment.pagbank_expires_at
                    ? formatDate(editingPayment.pagbank_expires_at)
                    : "--"}
                </strong>
              </p>
              {editingPayment.pagbank_qr_code_image_url ? (
                <a
                  className="ghost"
                  href={editingPayment.pagbank_qr_code_image_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir QR Code
                </a>
              ) : null}
              <label>
                Código PIX
                <textarea
                  className="input"
                  rows={4}
                  readOnly
                  value={editingPayment.pagbank_qr_code_text ?? ""}
                />
              </label>
              <label>
                Payload PagBank
                <textarea
                  className="input"
                  rows={6}
                  readOnly
                  value={
                    editingPayment.pagbank_payload
                      ? JSON.stringify(editingPayment.pagbank_payload, null, 2)
                      : ""
                  }
                />
              </label>
            </>
          )}
        </Modal>

        <Modal
          open={Boolean(editingAtendimento)}
          title="Editar atendimento"
          onClose={() => setEditingAtendimento(null)}
          footer={
            <button className="primary" onClick={handleUpdateAtendimento} type="button">
              Atualizar atendimento
            </button>
          }
        >
          {editingAtendimento && (
            <>
              <label>
                Cliente
                <select
                  className="select"
                  value={editingAtendimento.cliente_id ?? ""}
                  onChange={(event) =>
                    setEditingAtendimento({
                      ...editingAtendimento,
                      cliente_id: event.target.value || null,
                    })
                  }
                >
                  <option value="">Sem cliente</option>
                  {clientes.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  className="select"
                  value={editingAtendimento.status}
                  onChange={(event) =>
                    setEditingAtendimento({
                      ...editingAtendimento,
                      status: event.target.value,
                    })
                  }
                >
                  {atendimentoColumns.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Canal
                <input className="input" value={editingAtendimento.canal ?? ""} disabled />
              </label>
              <label>
                Responsável
                <input className="input" value={editingAtendimento.responsavel ?? ""} disabled />
              </label>
            </>
          )}
        </Modal>

        <Modal
          open={onboardingOpen}
          title="Configurar clinica e WhatsApp"
          onClose={() => setOnboardingOpen(false)}
          footer={
            <button className="primary" onClick={handleSaveOnboarding} type="button">
              Salvar configuracao
            </button>
          }
        >
          <label>
            Nome da clinica
            <input
              className="input"
              value={onboardingName}
              onChange={(event) => setOnboardingName(event.target.value)}
            />
          </label>
          <label>
            Telefone WhatsApp
            <input
              className="input"
              value={onboardingPhone}
              onChange={(event) => setOnboardingPhone(event.target.value)}
            />
          </label>
          <label>
            Instance ID
            <input
              className="input"
              value={onboardingInstance}
              onChange={(event) => setOnboardingInstance(event.target.value)}
            />
          </label>
          <label>
            URL da Evolution API
            <input
              className="input"
              value={onboardingApiUrl}
              onChange={(event) => setOnboardingApiUrl(event.target.value)}
            />
          </label>
        </Modal>
      </main>
      {solaraOpen ? (
        <div className="solara-panel open" role="dialog" aria-label="Solara AI">
          <header className="solara-panel-header">
            <div className="solara-panel-title">
              <span
                className={`status-dot ${
                  solaraStatus?.status === "human"
                    ? "status-dot--red"
                    : "status-dot--green"
                }`}
              />
              <div>
                <strong>Solara</strong>
                <small>
                  {solaraStatus?.status === "human"
                    ? "Humano solicitado"
                    : "Solara atendendo"}
                </small>
              </div>
            </div>
            <div className="solara-panel-actions">
              <button className="ghost" type="button" onClick={handleSolaraClear}>
                Limpar
              </button>
              <button
                className="ghost"
                type="button"
                onClick={() => setSolaraOpen(false)}
              >
                Fechar
              </button>
            </div>
          </header>
          <div className="solara-panel-body" ref={solaraBodyRef}>
            {solaraMessages.length === 0 ? (
              <p className="solara-empty">
                Oi! Eu sou a Solara. Posso ajudar com agendamentos, remarcacoes,
                cancelamentos e duvidas do sistema.
              </p>
            ) : (
              solaraMessages.map((message) => (
                <div
                  key={message.id}
                  className={`solara-message ${
                    message.role === "assistant"
                      ? "solara-message--assistant"
                      : "solara-message--user"
                  }`}
                >
                  <span>{message.content}</span>
                </div>
              ))
            )}
            {solaraLoading ? (
              <div className="solara-typing">Solara esta respondendo...</div>
            ) : null}
            {solaraError ? <div className="solara-error">{solaraError}</div> : null}
          </div>
          <div className="solara-panel-footer">
            <input
              className="input"
              placeholder="Digite sua mensagem..."
              value={solaraInput}
              onChange={(event) => setSolaraInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSolaraSend();
                }
              }}
            />
            <button
              className="primary"
              type="button"
              onClick={handleSolaraSend}
              disabled={solaraLoading}
            >
              Enviar
            </button>
          </div>
        </div>
      ) : null}
      <button
        className="ai-sun"
        aria-label="Solara AI"
        type="button"
        onClick={() => setSolaraOpen((prev) => !prev)}
        aria-expanded={solaraOpen}
      >
        <motion.div
          className="ai-sun-icon"
          animate={{ rotate: 360 }}
          transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
        >
          <svg viewBox="0 0 64 64" role="img" aria-hidden="true">
            <circle cx="32" cy="32" r="12" />
            <line x1="32" y1="4" x2="32" y2="14" />
            <line x1="32" y1="50" x2="32" y2="60" />
            <line x1="4" y1="32" x2="14" y2="32" />
            <line x1="50" y1="32" x2="60" y2="32" />
            <line x1="12" y1="12" x2="19" y2="19" />
            <line x1="45" y1="45" x2="52" y2="52" />
            <line x1="12" y1="52" x2="19" y2="45" />
            <line x1="45" y1="19" x2="52" y2="12" />
          </svg>
        </motion.div>
        <span>SOLARA</span>
      </button>
    </div>
  );
}
