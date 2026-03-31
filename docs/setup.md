# Setup do ambiente

## Stack alvo

- Node.js LTS 20+
- npm 10+
- Python 3.12+
- polars no workspace Python
- cache local em memoria durante o desenvolvimento

## Ordem sugerida

1. Instale o Node.js LTS.
2. Confirme `node -v` e `npm -v`.
3. Instale Python 3.12+ com `pip`.
4. Na raiz, rode `npm install`.
5. Em `services/data-platform`, crie um ambiente virtual e rode `pip install -e .`.

## Comandos principais

### Web

- `npm run dev:mei`
- `npm run dev:connect`

### Dados

- `python -m venv .venv`
- `.\\.venv\\Scripts\\Activate.ps1`
- `pip install -e .`
- `python -m solara_data.kpis`

## Cache sem Docker

- desenvolvimento local: `NEXT_PUBLIC_CACHE_MODE=memory`
- homologacao ou producao: `NEXT_PUBLIC_CACHE_MODE=redis`
- opcional em Windows: `NEXT_PUBLIC_CACHE_MODE=memurai`

Para este PC, a recomendacao atual e seguir sem Redis local. A plataforma foi preparada para trocar de provider sem refatorar a camada web.
