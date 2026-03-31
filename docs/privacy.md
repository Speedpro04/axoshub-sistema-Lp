# LGPD - Implementação Técnica

## Recursos disponíveis
- Exportação de dados por cliente (`/api/privacy/export`)
- Anonimização de dados (`/api/privacy/anonymize`)
- Exclusão de dados (`/api/privacy/delete`)
- Retenção automática de logs/eventos (`/api/privacy/retention`)

## Variáveis necessárias
- `LGPD_RETENTION_DAYS` (padrão 180)
- `APP_BASE_URL` (já usado em notificações/reprocessamento)

## Observações
- Exclusão remove cobranças e atendimentos do cliente (use com cautela).
- Anonimização preserva o histórico financeiro.
- Recomenda-se habilitar RLS no Supabase para isolamento entre tenants.

## RLS (multi-tenancy)
Use o script `docs/db/rls.sql` no Supabase para ativar RLS e políticas.
