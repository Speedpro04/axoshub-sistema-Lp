"use client";

import { useMeiStore } from "../mei-store";

export default function ConfiguracoesPage() {
  const { hydrated, state, updateProfile, updateSettings, updateNotifications } =
    useMeiStore();

  if (!hydrated) {
    return <div className="card">Carregando configuracoes...</div>;
  }

  return (
    <section className="configuracoes">
      <header className="section-header">
        <div>
          <h2>Configuracoes</h2>
          <p>Dados da empresa, notificacoes e assinatura.</p>
        </div>
      </header>

      <div className="grid-2">
        <article className="card">
          <header className="card-header">
            <div>
              <h3>Dados da empresa</h3>
              <p>Base do cadastro MEI.</p>
            </div>
          </header>
          <div className="form-grid">
            <label>
              Nome fantasia
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
                onChange={(event) => updateProfile({ ownerName: event.target.value })}
              />
            </label>
            <label>
              CNPJ
              <input
                className="input"
                value={state.profile.cnpj}
                onChange={(event) => updateProfile({ cnpj: event.target.value })}
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
          </div>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <h3>Notificacoes</h3>
              <p>Alertas essenciais para nao perder prazo.</p>
            </div>
          </header>
          <div className="form-grid">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={state.notifications.dasReminders}
                onChange={(event) =>
                  updateNotifications({ dasReminders: event.target.checked })
                }
              />
              Lembretes do DAS (5, 2 e 0 dias)
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={state.notifications.limitAlerts}
                onChange={(event) =>
                  updateNotifications({ limitAlerts: event.target.checked })
                }
              />
              Alertas de limite MEI (70%, 85%, 95%)
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={state.notifications.meiUpdates}
                onChange={(event) =>
                  updateNotifications({ meiUpdates: event.target.checked })
                }
              />
              Atualizacoes oficiais do MEI
            </label>
          </div>
        </article>
      </div>

      <div className="grid-2">
        <article className="card">
          <header className="card-header">
            <div>
              <h3>WhatsApp e resumo diario</h3>
              <p>Integracao Evolution API.</p>
            </div>
          </header>
          <div className="form-grid">
            <label>
              Numero WhatsApp
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
              Resumo diario ativo
            </label>
            <label>
              Evolution API URL
              <input
                className="input"
                value={state.settings.evolutionApiUrl}
                onChange={(event) =>
                  updateSettings({ evolutionApiUrl: event.target.value })
                }
              />
            </label>
            <label>
              Instance ID
              <input
                className="input"
                value={state.settings.evolutionInstanceId}
                onChange={(event) =>
                  updateSettings({ evolutionInstanceId: event.target.value })
                }
              />
            </label>
          </div>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <h3>Assinatura</h3>
              <p>Pagamentos e status da conta.</p>
            </div>
          </header>
          <div className="list">
            <div className="list-item">
              <div>
                <strong>Plano atual</strong>
                <small>{state.settings.subscriptionPlan}</small>
              </div>
              <span className="tag tag--ok">{state.settings.subscriptionStatus}</span>
            </div>
            <div className="list-item">
              <div>
                <strong>Dia do DAS</strong>
                <small>Define o lembrete mensal</small>
              </div>
              <input
                className="input"
                type="number"
                min={1}
                max={28}
                value={state.settings.dasDay}
                onChange={(event) =>
                  updateSettings({ dasDay: Number(event.target.value) })
                }
              />
            </div>
            <button className="ghost-button" type="button">
              Atualizar pagamento (PagBank)
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
