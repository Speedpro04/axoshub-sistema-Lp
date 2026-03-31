"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MEI_UPDATES } from "../mei-data";
import { useMeiStore } from "../mei-store";
import {
  diffInDays,
  formatDate,
  formatMoney,
  getNextDasDate,
  toDateKey,
  toMonthKey,
} from "../mei-utils";

const WORK_OPTIONS = [
  { value: true, label: "Trabalhei hoje" },
  { value: false, label: "Nao trabalhei" },
];

const LIMIT_THRESHOLDS = [0.7, 0.85, 0.95];

export default function DashboardPage() {
  const {
    hydrated,
    state,
    addTransaction,
    setDailyStatus,
    markSummarySent,
    updateProfile,
    updateSettings,
    completeOnboarding,
  } = useMeiStore();
  const [now, setNow] = useState(new Date());
  const [checkinType, setCheckinType] = useState<"receita" | "despesa">("receita");
  const [checkinLabel, setCheckinLabel] = useState("");
  const [checkinAmount, setCheckinAmount] = useState("");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingIncome, setOnboardingIncome] = useState("");
  const [onboardingLabel, setOnboardingLabel] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (!state.onboardingCompleted) {
      setOnboardingOpen(true);
      setOnboardingStep(1);
    }
  }, [hydrated, state.onboardingCompleted]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const todayKey = toDateKey(now);
  const monthKey = toMonthKey(now);
  const yearKey = String(now.getFullYear());

  const todayTransactions = state.transactions.filter((tx) =>
    tx.date.startsWith(todayKey)
  );
  const monthTransactions = state.transactions.filter((tx) =>
    tx.date.startsWith(monthKey)
  );
  const yearTransactions = state.transactions.filter((tx) =>
    tx.date.startsWith(yearKey)
  );

  const sumByType = (list: typeof state.transactions, type: "receita" | "despesa") =>
    list.filter((tx) => tx.type === type).reduce((sum, tx) => sum + tx.amount, 0);

  const monthRevenue = sumByType(monthTransactions, "receita");
  const monthExpense = sumByType(monthTransactions, "despesa");
  const monthProfit = monthRevenue - monthExpense;
  const dayRevenue = sumByType(todayTransactions, "receita");
  const dayExpense = sumByType(todayTransactions, "despesa");
  const yearRevenue = sumByType(yearTransactions, "receita");
  const limitPercent = Math.min(100, (yearRevenue / state.yearlyLimit) * 100);

  const dasDate = getNextDasDate(now, state.settings.dasDay);
  const daysToDas = diffInDays(now, dasDate);

  const lastCheckin = state.dailyCheckins.find((checkin) => checkin.date === todayKey);
  const hasWorkedAnswer = lastCheckin?.worked !== null && lastCheckin?.worked !== undefined;
  const checkinCompleted =
    (hasWorkedAnswer && todayTransactions.length > 0) || lastCheckin?.worked === false;

  const summaryContent = useMemo(() => {
    const saldoDia = dayRevenue - dayExpense;
    const saldoMes = monthRevenue - monthExpense;
    return `Resumo do dia: R$ ${saldoDia.toFixed(
      2
    )} | Mes: R$ ${saldoMes.toFixed(
      2
    )} | Proximo DAS: ${formatDate(dasDate)}`;
  }, [dayRevenue, dayExpense, monthRevenue, monthExpense, dasDate]);

  const summarySentToday = state.lastSummarySentAt?.startsWith(todayKey) ?? false;
  const shouldSummarySend =
    state.settings.summaryEnabled &&
    !summarySentToday &&
    now.toTimeString().slice(0, 5) >= state.settings.summaryTime;

  const limitAlerts = LIMIT_THRESHOLDS.filter(
    (threshold) => yearRevenue >= threshold * state.yearlyLimit
  );

  if (!hydrated) {
    return <div className="card">Carregando painel...</div>;
  }

  const handleCheckinSubmit = () => {
    if (!checkinLabel || !checkinAmount) return;
    addTransaction({
      type: checkinType,
      label: checkinLabel,
      amount: Number(checkinAmount),
      date: new Date().toISOString(),
    });
    setCheckinLabel("");
    setCheckinAmount("");
  };

  const handleOnboardingNext = () => {
    if (onboardingStep === 3) {
      if (onboardingLabel && onboardingIncome) {
        addTransaction({
          type: "receita",
          label: onboardingLabel,
          amount: Number(onboardingIncome),
          date: new Date().toISOString(),
        });
      }
      completeOnboarding();
      setOnboardingOpen(false);
      return;
    }
    setOnboardingStep((prev) => prev + 1);
  };

  return (
    <section className="dashboard">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Bom dia, {state.profile.ownerName}</p>
          <h2>Hoje, {formatDate(now)}</h2>
        </div>
        <div className="status-pill">
          <span>{checkinCompleted ? "Check-in completo" : "Check-in pendente"}</span>
        </div>
      </div>

      <div className="grid-3">
        <article className="stat-card">
          <p>Faturamento do mes</p>
          <strong>{formatMoney(monthRevenue)}</strong>
        </article>
        <article className="stat-card">
          <p>Despesas do mes</p>
          <strong>{formatMoney(monthExpense)}</strong>
        </article>
        <article className="stat-card">
          <p>Lucro do mes</p>
          <strong>{formatMoney(monthProfit)}</strong>
        </article>
      </div>

      <div className="grid-2">
        <article className="card">
          <header className="card-header">
            <div>
              <h3>Check-in do dia</h3>
              <p>Registre o caixa em menos de 90 segundos.</p>
            </div>
            <span className={`tag ${checkinCompleted ? "tag--ok" : "tag--warn"}`}>
              {checkinCompleted ? "Concluido" : "Pendencia"}
            </span>
          </header>
          <div className="form-grid">
            <label>
              Tipo
              <select
                className="input"
                value={checkinType}
                onChange={(event) =>
                  setCheckinType(event.target.value as "receita" | "despesa")
                }
              >
                <option value="receita">Receita</option>
                <option value="despesa">Despesa</option>
              </select>
            </label>
            <label>
              Descricao
              <input
                className="input"
                value={checkinLabel}
                onChange={(event) => setCheckinLabel(event.target.value)}
                placeholder="Ex: Atendimento, material"
              />
            </label>
            <label>
              Valor
              <input
                className="input"
                value={checkinAmount}
                onChange={(event) => setCheckinAmount(event.target.value)}
                placeholder="0,00"
              />
            </label>
            <button className="primary" type="button" onClick={handleCheckinSubmit}>
              Registrar agora
            </button>
          </div>
          <div className="inline-options">
            {WORK_OPTIONS.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                className={`pill ${
                  lastCheckin?.worked === option.value ? "pill--active" : ""
                }`}
                onClick={() => setDailyStatus(todayKey, option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <h3>Resumo diario</h3>
              <p>Enviado por WhatsApp e mostrado aqui.</p>
            </div>
            <span className={`tag ${state.settings.summaryEnabled ? "tag--ok" : "tag--muted"}`}>
              {state.settings.summaryEnabled ? "Ativo" : "Pausado"}
            </span>
          </header>
          <div className="summary-box">
            <p>{summaryContent}</p>
            <small>
              Horario configurado: {state.settings.summaryTime} · WhatsApp{" "}
              {state.settings.whatsappNumber}
            </small>
          </div>
          <div className="summary-actions">
            <button
              className="primary"
              type="button"
              onClick={() => markSummarySent(summaryContent)}
              disabled={!state.settings.summaryEnabled}
            >
              Enviar agora
            </button>
            <Link className="ghost-button" href="/configuracoes">
              Ajustar horario
            </Link>
          </div>
          {shouldSummarySend ? (
            <p className="hint">Resumo pronto para envio hoje.</p>
          ) : null}
        </article>
      </div>

      <div className="grid-2">
        <article className="card">
          <header className="card-header">
            <div>
              <h3>Termometro MEI</h3>
              <p>Limite anual de R$ 81 mil</p>
            </div>
            <strong>{formatMoney(yearRevenue)}</strong>
          </header>
          <div className="progress-track">
            <span style={{ width: `${limitPercent}%` }} />
          </div>
          <div className="thresholds">
            {LIMIT_THRESHOLDS.map((threshold) => (
              <div key={threshold} className="threshold">
                <span>{Math.round(threshold * 100)}%</span>
                <span>
                  {yearRevenue >= threshold * state.yearlyLimit ? "Alerta" : "OK"}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <h3>Alertas fiscais</h3>
              <p>DAS e limites sob controle</p>
            </div>
            <span className="tag tag--warn">Proximo DAS</span>
          </header>
          <div className="alert-list">
            <div>
              <strong>Pagamento DAS</strong>
              <p>
                {formatDate(dasDate)} · faltam {daysToDas} dias
              </p>
            </div>
            {limitAlerts.length > 0 ? (
              limitAlerts.map((threshold) => (
                <div key={threshold}>
                  <strong>Limite {Math.round(threshold * 100)}%</strong>
                  <p>Seu faturamento anual esta acima deste patamar.</p>
                </div>
              ))
            ) : (
              <div>
                <strong>Limite anual</strong>
                <p>Abaixo de 70% do limite, sem risco imediato.</p>
              </div>
            )}
          </div>
        </article>
      </div>

      <div className="grid-2">
        <article className="card">
          <header className="card-header">
            <div>
              <h3>Atualizacoes do MEI</h3>
              <p>Resumo rapido de fontes oficiais</p>
            </div>
          </header>
          <div className="update-list">
            {MEI_UPDATES.map((update) => (
              <div key={update.id}>
                <strong>{update.title}</strong>
                <p>{update.summary}</p>
                <small>
                  {update.source} · {formatDate(update.date)}
                </small>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <h3>Resumo rapido</h3>
              <p>O que importa hoje</p>
            </div>
          </header>
          <ul className="summary-list">
            <li>Receitas hoje: {formatMoney(dayRevenue)}</li>
            <li>Despesas hoje: {formatMoney(dayExpense)}</li>
            <li>Saldo do mes: {formatMoney(monthProfit)}</li>
            <li>Proximo DAS: {formatDate(dasDate)}</li>
          </ul>
          {todayTransactions.length === 0 ? (
            <Link className="primary" href="/financeiro">
              Registrar agora
            </Link>
          ) : (
            <Link className="ghost-button" href="/financeiro">
              Abrir financeiro
            </Link>
          )}
        </article>
      </div>

      {onboardingOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <header>
              <h3>Onboarding rapido</h3>
              <p>Passo {onboardingStep} de 3</p>
            </header>
            <div className="modal-body">
              {onboardingStep === 1 ? (
                <div className="form-grid">
                  <label>
                    Nome da empresa
                    <input
                      className="input"
                      value={state.profile.businessName}
                      onChange={(event) =>
                        updateProfile({ businessName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Responsavel
                    <input
                      className="input"
                      value={state.profile.ownerName}
                      onChange={(event) =>
                        updateProfile({ ownerName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Cidade
                    <input
                      className="input"
                      value={state.profile.city}
                      onChange={(event) => updateProfile({ city: event.target.value })}
                    />
                  </label>
                  <label>
                    Atividade
                    <input
                      className="input"
                      value={state.profile.activity}
                      onChange={(event) =>
                        updateProfile({ activity: event.target.value })
                      }
                    />
                  </label>
                </div>
              ) : null}
              {onboardingStep === 2 ? (
                <div className="form-grid">
                  <label>
                    WhatsApp
                    <input
                      className="input"
                      value={state.settings.whatsappNumber}
                      onChange={(event) =>
                        updateSettings({ whatsappNumber: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Horario do resumo
                    <input
                      className="input"
                      type="time"
                      value={state.settings.summaryTime}
                      onChange={(event) =>
                        updateSettings({ summaryTime: event.target.value })
                      }
                    />
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={state.settings.summaryEnabled}
                      onChange={(event) =>
                        updateSettings({ summaryEnabled: event.target.checked })
                      }
                    />
                    Ativar resumo diario
                  </label>
                </div>
              ) : null}
              {onboardingStep === 3 ? (
                <div className="form-grid">
                  <label>
                    Primeiro lancamento
                    <input
                      className="input"
                      value={onboardingLabel}
                      onChange={(event) => setOnboardingLabel(event.target.value)}
                      placeholder="Ex: Atendimento"
                    />
                  </label>
                  <label>
                    Valor recebido
                    <input
                      className="input"
                      value={onboardingIncome}
                      onChange={(event) => setOnboardingIncome(event.target.value)}
                      placeholder="0,00"
                    />
                  </label>
                </div>
              ) : null}
            </div>
            <footer className="modal-footer">
              <button className="primary" type="button" onClick={handleOnboardingNext}>
                {onboardingStep === 3 ? "Finalizar" : "Continuar"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
