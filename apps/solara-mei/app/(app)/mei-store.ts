"use client";

import { useEffect, useMemo, useState } from "react";
import { MEI_LIMIT } from "./mei-data";
import { parseMoney, toDateKey } from "./mei-utils";

export type Transaction = {
  id: string;
  type: "receita" | "despesa";
  label: string;
  amount: number;
  date: string;
};

export type ClientEntry = {
  id: string;
  nome: string;
  telefone: string;
  servico: string;
  valor: number;
  data: string;
  observacao: string;
};

export type DailyCheckin = {
  date: string;
  worked: boolean | null;
  updatedAt: string;
};

export type SummaryLog = {
  id: string;
  sentAt: string;
  content: string;
};

export type MeiProfile = {
  businessName: string;
  ownerName: string;
  city: string;
  cnpj: string;
  activity: string;
};

export type MeiSettings = {
  summaryTime: string;
  summaryEnabled: boolean;
  whatsappNumber: string;
  evolutionApiUrl: string;
  evolutionInstanceId: string;
  dasDay: number;
  subscriptionStatus: "Ativa" | "Pendente" | "Pausada";
  subscriptionPlan: string;
};

export type MeiNotifications = {
  dasReminders: boolean;
  limitAlerts: boolean;
  meiUpdates: boolean;
};

export type MeiState = {
  onboardingCompleted: boolean;
  profile: MeiProfile;
  settings: MeiSettings;
  notifications: MeiNotifications;
  transactions: Transaction[];
  clients: ClientEntry[];
  dailyCheckins: DailyCheckin[];
  summaryLog: SummaryLog[];
  lastSummarySentAt: string | null;
  yearlyLimit: number;
};

type Store = {
  hydrated: boolean;
  state: MeiState;
  addTransaction: (payload: Omit<Transaction, "id">) => void;
  addClient: (payload: Omit<ClientEntry, "id">) => void;
  updateProfile: (patch: Partial<MeiProfile>) => void;
  updateSettings: (patch: Partial<MeiSettings>) => void;
  updateNotifications: (patch: Partial<MeiNotifications>) => void;
  setDailyStatus: (date: string, worked: boolean) => void;
  markSummarySent: (content: string) => void;
  completeOnboarding: () => void;
};

const STORAGE_KEY = "solara.mei.state";

const buildSampleTransactions = () => {
  const today = new Date();
  const day = (offset: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    return date;
  };
  return [
    {
      id: "tx-1",
      type: "receita" as const,
      label: "Design de sobrancelha",
      amount: 180,
      date: day(0).toISOString(),
    },
    {
      id: "tx-2",
      type: "despesa" as const,
      label: "Materiais e pigmentos",
      amount: 42,
      date: day(0).toISOString(),
    },
    {
      id: "tx-3",
      type: "receita" as const,
      label: "Limpeza de pele",
      amount: 220,
      date: day(1).toISOString(),
    },
    {
      id: "tx-4",
      type: "despesa" as const,
      label: "Transporte",
      amount: 36,
      date: day(3).toISOString(),
    },
    {
      id: "tx-5",
      type: "receita" as const,
      label: "Pacote sobrancelha + cilios",
      amount: 310,
      date: day(6).toISOString(),
    },
    {
      id: "tx-6",
      type: "despesa" as const,
      label: "Internet e telefone",
      amount: 99,
      date: day(10).toISOString(),
    },
  ];
};

const buildDefaultState = (): MeiState => {
  const now = new Date();
  return {
    onboardingCompleted: false,
    profile: {
      businessName: "Studio Aurora",
      ownerName: "Marina Costa",
      city: "Campinas - SP",
      cnpj: "12.345.678/0001-90",
      activity: "Beleza e estetica",
    },
    settings: {
      summaryTime: "19:30",
      summaryEnabled: true,
      whatsappNumber: "5511999990000",
      evolutionApiUrl: "https://evoapi.seu-dominio.com",
      evolutionInstanceId: "solara-mei-01",
      dasDay: 20,
      subscriptionStatus: "Ativa",
      subscriptionPlan: "R$ 39,90 / mes",
    },
    notifications: {
      dasReminders: true,
      limitAlerts: true,
      meiUpdates: true,
    },
    transactions: buildSampleTransactions(),
    clients: [
      {
        id: "client-1",
        nome: "Ana Ribeiro",
        telefone: "1198181-3200",
        servico: "Micropigmentacao",
        valor: 480,
        data: now.toISOString(),
        observacao: "Retorno agendado para abril",
      },
      {
        id: "client-2",
        nome: "Luciana Perez",
        telefone: "1199123-9981",
        servico: "Limpeza de pele",
        valor: 220,
        data: now.toISOString(),
        observacao: "Prefere horario a tarde",
      },
      {
        id: "client-3",
        nome: "Paula Soares",
        telefone: "1197001-2200",
        servico: "Design de sobrancelha",
        valor: 180,
        data: now.toISOString(),
        observacao: "Cliente recorrente",
      },
    ],
    dailyCheckins: [
      {
        date: toDateKey(now),
        worked: null,
        updatedAt: now.toISOString(),
      },
    ],
    summaryLog: [],
    lastSummarySentAt: null,
    yearlyLimit: MEI_LIMIT,
  };
};

const mergeState = (base: MeiState, incoming: Partial<MeiState>): MeiState => {
  return {
    ...base,
    ...incoming,
    profile: { ...base.profile, ...incoming.profile },
    settings: { ...base.settings, ...incoming.settings },
    notifications: { ...base.notifications, ...incoming.notifications },
    transactions: incoming.transactions ?? base.transactions,
    clients: incoming.clients ?? base.clients,
    dailyCheckins: incoming.dailyCheckins ?? base.dailyCheckins,
    summaryLog: incoming.summaryLog ?? base.summaryLog,
    yearlyLimit: incoming.yearlyLimit ?? base.yearlyLimit,
  };
};

const loadState = (): MeiState => {
  if (typeof window === "undefined") return buildDefaultState();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return buildDefaultState();
  try {
    const parsed = JSON.parse(raw) as Partial<MeiState>;
    return mergeState(buildDefaultState(), parsed);
  } catch {
    return buildDefaultState();
  }
};

export function useMeiStore(): Store {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<MeiState>(() => buildDefaultState());

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const addTransaction = (payload: Omit<Transaction, "id">) => {
    const amount = parseMoney(payload.amount);
    setState((prev) => ({
      ...prev,
      transactions: [
        {
          ...payload,
          amount,
          id: `tx-${Date.now()}`,
        },
        ...prev.transactions,
      ],
    }));
  };

  const addClient = (payload: Omit<ClientEntry, "id">) => {
    const amount = parseMoney(payload.valor);
    setState((prev) => ({
      ...prev,
      clients: [
        {
          ...payload,
          valor: amount,
          id: `client-${Date.now()}`,
        },
        ...prev.clients,
      ],
    }));
  };

  const updateProfile = (patch: Partial<MeiProfile>) => {
    setState((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
  };

  const updateSettings = (patch: Partial<MeiSettings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  };

  const updateNotifications = (patch: Partial<MeiNotifications>) => {
    setState((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, ...patch },
    }));
  };

  const setDailyStatus = (date: string, worked: boolean) => {
    setState((prev) => {
      const next = prev.dailyCheckins.filter((checkin) => checkin.date !== date);
      next.unshift({ date, worked, updatedAt: new Date().toISOString() });
      return { ...prev, dailyCheckins: next };
    });
  };

  const markSummarySent = (content: string) => {
    const sentAt = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      summaryLog: [
        { id: `summary-${Date.now()}`, sentAt, content },
        ...prev.summaryLog,
      ].slice(0, 10),
      lastSummarySentAt: sentAt,
    }));
  };

  const completeOnboarding = () => {
    setState((prev) => ({ ...prev, onboardingCompleted: true }));
  };

  const store = useMemo(
    () => ({
      hydrated,
      state,
      addTransaction,
      addClient,
      updateProfile,
      updateSettings,
      updateNotifications,
      setDailyStatus,
      markSummarySent,
      completeOnboarding,
    }),
    [hydrated, state]
  );

  return store;
}
