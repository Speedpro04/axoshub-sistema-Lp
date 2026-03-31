# PagBank (PIX) - Setup

## 1) Variáveis de ambiente
Preencha no `.env.local` da app `solara-connect`:

- `PAGBANK_TOKEN`
- `PAGBANK_ENV` (`sandbox` ou `production`)
- `PAGBANK_BASE_URL` (opcional)
- `PAGBANK_DEFAULT_EMAIL`
- `PAGBANK_DEFAULT_TAX_ID`
- `PAGBANK_DEFAULT_PHONE` (opcional)
- `PAGBANK_NOTIFICATION_URL` (URL pública do webhook)
- `PAGBANK_WEBHOOK_TOKEN` (token de autenticidade do webhook)
- `APP_BASE_URL` (URL pública da aplicação, usada no reprocessamento)
- `PAGBANK_ALERT_PHONE` (WhatsApp que receberá alertas)
- `PAGBANK_ALERT_WEBHOOK_URL` (endpoint externo para alertas por email)
- `PAGBANK_PIX_EXPIRES_MINUTES` (expiração interna do PIX)

## 2) Banco de dados
Execute o script em `docs/db/pagbank.sql` no Supabase.

## 3) Webhook
Configure o webhook no PagBank para apontar para:

```
POST /api/pagbank/webhook
```

O endpoint valida a assinatura `x-authenticity-token` usando SHA-256 e o token do PagBank.

## 4) Fluxo no produto
- Crie uma cobrança na Central → o sistema gera o PIX e mostra o código.
- O webhook do PagBank atualiza o status da cobrança automaticamente.

## 5) Alertas e conciliação
- Alertas de webhook (assinatura inválida, falhas de atualização) aparecem na aba Cobranças.
- A conciliação mostra cobranças sem PIX e divergências de status.

## 6) Conciliação manual
- Use `POST /api/pagbank/reconcile` para reconciliar 50 cobranças mais recentes com `pagbank_order_id`.

## 7) Retentativas de webhook
- Chame `POST /api/pagbank/reprocess` via cron para reprocessar falhas.

## 8) Notificações de alertas
- Chame `POST /api/pagbank/notify` via cron para enviar alertas por WhatsApp ou webhook.

## 9) Expiração automática
- Chame `POST /api/pagbank/expire` via cron para marcar cobranças vencidas como Cancelado.
