# Solara API (FastAPI)

Backend FastAPI para migração gradual das rotas críticas do Solara Connect.

## Requisitos

- Python 3.11+
- Variáveis de ambiente configuradas

## Variáveis

Use um arquivo `.env` no diretório `services/solara-api`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SEU_SERVICE_ROLE_KEY
EVOLUTION_API_URL=https://evoapi.axoshub.com
EVOLUTION_INSTANCE=axos-evoapi
DEFAULT_WHATSAPP_NUMBER=5512991187251
```

## Instalação

```powershell
cd C:\Users\Usuario\OneDrive\Documentos\Playground\services\solara-api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
```

## Execução

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

## Endpoints

- `GET /health`
- `POST /tenants/ensure` (compatível com o fluxo atual do frontend)

## Integração com Next.js

No `apps/solara-connect/.env.local`:

```env
FASTAPI_BASE_URL=http://localhost:8010
```

Sem `FASTAPI_BASE_URL`, o Next.js continua usando a implementação local.

