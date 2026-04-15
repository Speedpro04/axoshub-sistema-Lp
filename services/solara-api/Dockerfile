FROM python:3.11-slim

WORKDIR /app

# Instala dependências do sistema
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

# Copia pyproject.toml para instalar as dependências via pip
COPY pyproject.toml /app/
RUN pip install hatchling && pip install .

# Copia a pasta app
COPY app /app/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
