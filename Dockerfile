FROM node:20-alpine

WORKDIR /app

# Copia tudo do repositório
COPY . .

# Instala todas as dependências do monorepo
RUN npm install

# Faz a build exclusiva do Solara Connect usando os pacotes do monorepo
RUN npm run build --workspace apps/solara-connect

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME="0.0.0.0"

# Roda o aplicativo específico
CMD ["npm", "start", "--workspace", "apps/solara-connect"]
