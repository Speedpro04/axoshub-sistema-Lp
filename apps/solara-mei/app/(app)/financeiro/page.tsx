"use client";

import { useMemo, useState } from "react";
import { useMeiStore } from "../mei-store";
import { exportCsv, formatDate, formatMoney, toMonthKey } from "../mei-utils";

export default function FinanceiroPage() {
  const { hydrated, state, addTransaction } = useMeiStore();
  const [type, setType] = useState<"receita" | "despesa">("receita");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const monthKey = toMonthKey(new Date());
  const monthTransactions = state.transactions.filter((tx) =>
    tx.date.startsWith(monthKey)
  );

  const monthRevenue = monthTransactions
    .filter((tx) => tx.type === "receita")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const monthExpense = monthTransactions
    .filter((tx) => tx.type === "despesa")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const monthProfit = monthRevenue - monthExpense;

  const monthlySeries = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }).map((_, index) => {
      const dateRef = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = toMonthKey(dateRef);
      const total = state.transactions
        .filter((tx) => tx.date.startsWith(key) && tx.type === "receita")
        .reduce((sum, tx) => sum + tx.amount, 0);
      return {
        key,
        label: dateRef.toLocaleDateString("pt-BR", { month: "short" }),
        total,
      };
    });
  }, [state.transactions]);

  const maxMonthly = Math.max(...monthlySeries.map((item) => item.total), 1);

  if (!hydrated) {
    return <div className="card">Carregando financeiro...</div>;
  }

  const handleAdd = () => {
    if (!label || !amount) return;
    addTransaction({
      type,
      label,
      amount: Number(amount),
      date: new Date(date).toISOString(),
    });
    setLabel("");
    setAmount("");
  };

  const handleExportCsv = () => {
    exportCsv("solara-mei-financeiro.csv", state.transactions);
  };

  return (
    <section className="financeiro">
      <header className="section-header">
        <div>
          <h2>Financeiro</h2>
          <p>Controle principal do caixa mensal.</p>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={handleExportCsv}>
            Exportar CSV
          </button>
          <button className="primary" type="button" onClick={() => window.print()}>
            Exportar PDF
          </button>
        </div>
      </header>

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

      <article className="card chart-card">
        <header className="card-header">
          <div>
            <h3>Grafico de faturamento</h3>
            <p>Ultimos 6 meses</p>
          </div>
        </header>
        <div className="bar-chart">
          {monthlySeries.map((item) => (
            <div key={item.key} className="bar-item">
              <span style={{ height: `${(item.total / maxMonthly) * 100}%` }} />
              <small>{item.label}</small>
            </div>
          ))}
        </div>
      </article>

      <div className="grid-2">
        <article className="card">
          <header className="card-header">
            <div>
              <h3>Adicionar lancamento</h3>
              <p>Receita ou despesa, sem friccao.</p>
            </div>
          </header>
          <div className="form-grid">
            <label>
              Tipo
              <select
                className="input"
                value={type}
                onChange={(event) => setType(event.target.value as "receita" | "despesa")}
              >
                <option value="receita">Receita</option>
                <option value="despesa">Despesa</option>
              </select>
            </label>
            <label>
              Descricao
              <input
                className="input"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            <label>
              Valor
              <input
                className="input"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label>
              Data
              <input
                className="input"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <button className="primary" type="button" onClick={handleAdd}>
              Adicionar
            </button>
          </div>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <h3>Lista de lancamentos</h3>
              <p>Receitas e despesas recentes.</p>
            </div>
          </header>
          <div className="list">
            {state.transactions.slice(0, 8).map((tx) => (
              <div key={tx.id} className="list-item">
                <div>
                  <strong>{tx.label}</strong>
                  <small>{formatDate(tx.date)}</small>
                </div>
                <span className={tx.type === "receita" ? "value up" : "value down"}>
                  {tx.type === "receita" ? "+" : "-"}
                  {formatMoney(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
