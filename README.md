# Solara Platform

Base de monorepo para os produtos `SOLARA MEI` e `SOLARA CONNECT`.

## Estrutura

- `apps/solara-mei`: portal Next.js para operacao, onboarding e jornada MEI.
- `apps/solara-connect`: modulo de recepcao digital (Solara Connect).
- `packages/runtime`: camada compartilhada de runtime para estrategia de cache e bootstrap de ambiente.
- `services/data-platform`: workspace Python para analytics, ETL e indicadores com `polars`.
- `services/solara-api`: backend FastAPI para migracao gradual de regras de negocio.
- `docs/setup.md`: checklist de setup do ambiente apos formatacao.

## Direcao arquitetural

Os dois produtos foram mantidos separados no codigo porque atendem superficies de negocio diferentes, mas compartilham a mesma plataforma SaaS. Isso facilita evolucao independente sem misturar roadmap, branding ou regras de acesso.

## Cache e infraestrutura local

O projeto foi preparado para desenvolvimento local sem Redis instalado e sem Docker. A estrategia padrao usa fallback em memoria no ambiente local e preserva compatibilidade futura com Redis gerenciado ou Memurai.

## Proximos passos

1. Rodar `npm install` na raiz.
2. Copiar `apps/solara-connect/.env.example` para `apps/solara-connect/.env.local`.
3. Rodar o Solara Connect com `cd apps/solara-connect && npm run dev`.
4. Validar o webhook da Evolution e o login Supabase.
