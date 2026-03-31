"use client";

import { useMemo, useState } from "react";
import { useMeiStore } from "../mei-store";
import { formatDate, formatMoney } from "../mei-utils";

export default function ClientesPage() {
  const { hydrated, state, addClient } = useMeiStore();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [servico, setServico] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState("");

  const totalServicos = useMemo(
    () => state.clients.reduce((sum, client) => sum + client.valor, 0),
    [state.clients]
  );
  const ticketMedio = state.clients.length ? totalServicos / state.clients.length : 0;

  if (!hydrated) {
    return <div className="card">Carregando clientes...</div>;
  }

  const handleAdd = () => {
    if (!nome || !servico || !valor) return;
    addClient({
      nome,
      telefone,
      servico,
      valor: Number(valor),
      data: new Date(data).toISOString(),
      observacao,
    });
    setNome("");
    setTelefone("");
    setServico("");
    setValor("");
    setObservacao("");
  };

  return (
    <section className="clientes">
      <header className="section-header">
        <div>
          <h2>Clientes</h2>
          <p>CRM basico para organizar servicos e relacionamento.</p>
        </div>
      </header>

      <div className="grid-3">
        <article className="stat-card">
          <p>Total de clientes</p>
          <strong>{state.clients.length}</strong>
        </article>
        <article className="stat-card">
          <p>Servicos registrados</p>
          <strong>{formatMoney(totalServicos)}</strong>
        </article>
        <article className="stat-card">
          <p>Ticket medio</p>
          <strong>{formatMoney(ticketMedio)}</strong>
        </article>
      </div>

      <div className="grid-2">
        <article className="card">
          <header className="card-header">
            <div>
              <h3>Novo cliente</h3>
              <p>Registre o atendimento para manter o historico.</p>
            </div>
          </header>
          <div className="form-grid">
            <label>
              Nome
              <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
            </label>
            <label>
              Telefone
              <input
                className="input"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
              />
            </label>
            <label>
              Servico
              <input
                className="input"
                value={servico}
                onChange={(e) => setServico(e.target.value)}
              />
            </label>
            <label>
              Valor
              <input className="input" value={valor} onChange={(e) => setValor(e.target.value)} />
            </label>
            <label>
              Data
              <input
                className="input"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </label>
            <label>
              Observacao
              <input
                className="input"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
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
              <h3>Historico de clientes</h3>
              <p>Ultimos atendimentos registrados.</p>
            </div>
          </header>
          <div className="table">
            <div className="table-row table-header">
              <span>Nome</span>
              <span>Servico</span>
              <span>Valor</span>
              <span>Data</span>
            </div>
            {state.clients.map((client) => (
              <div key={client.id} className="table-row">
                <span>
                  <strong>{client.nome}</strong>
                  <small>{client.telefone}</small>
                </span>
                <span>{client.servico}</span>
                <span>{formatMoney(client.valor)}</span>
                <span>{formatDate(client.data)}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
