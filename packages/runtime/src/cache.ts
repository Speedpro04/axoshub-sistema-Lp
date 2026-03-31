export type CacheMode = "memory" | "redis" | "memurai";

export type CacheStatus = {
  mode: CacheMode;
  providerLabel: string;
  durable: boolean;
  notes: string[];
};

const modeMap: Record<string, CacheStatus> = {
  memory: {
    mode: "memory",
    providerLabel: "Fallback em memoria",
    durable: false,
    notes: [
      "Ideal para desenvolvimento local leve.",
      "Nao exige Docker ou Redis instalado na maquina.",
      "Dados de cache reiniciam quando o processo sobe novamente.",
    ],
  },
  redis: {
    mode: "redis",
    providerLabel: "Redis gerenciado",
    durable: true,
    notes: [
      "Recomendado para ambiente de homologacao e producao.",
      "Pode apontar para Upstash, Redis Cloud ou outra oferta gerenciada.",
      "Mantem compatibilidade com filas, locks e rate limiting.",
    ],
  },
  memurai: {
    mode: "memurai",
    providerLabel: "Memurai no Windows",
    durable: true,
    notes: [
      "Opcao nativa para Windows quando Redis local for necessario.",
      "Evita dependencia de Docker em maquinas mais limitadas.",
      "Mantem boa compatibilidade com clientes Redis.",
    ],
  },
};

export function getCacheStatus(mode = process.env.NEXT_PUBLIC_CACHE_MODE): CacheStatus {
  if (!mode) {
    return modeMap.memory;
  }

  return modeMap[mode.toLowerCase()] ?? modeMap.memory;
}

export function getRecommendedCacheEnv() {
  return {
    NEXT_PUBLIC_CACHE_MODE: process.env.NEXT_PUBLIC_CACHE_MODE ?? "memory",
    REDIS_URL: process.env.REDIS_URL ?? "",
  };
}
