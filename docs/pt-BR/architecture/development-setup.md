# Setup de desenvolvimento

Este guia descreve como preparar o BucketDrive localmente.

## Pre-requisitos

- Node.js >= 20
- pnpm >= 9
- Wrangler >= 3
- Conta Cloudflare
- Pelo menos um provedor OAuth para Better Auth, como GitHub ou Google

## Configuracao inicial

```bash
git clone https://github.com/your-org/bucketdrive
cd bucketdrive
pnpm install
cp .env.example .dev.vars
pnpm env:link
```

Edite `.dev.vars` com os segredos locais. Esse arquivo e a fonte canonica do ambiente de desenvolvimento; `pnpm env:link` liga os arquivos de `apps/api` e `apps/workers` a ele.

Campos importantes:

```env
BETTER_AUTH_SECRET=<gerar com openssl rand -base64 64>
BETTER_AUTH_URL=http://localhost:8787
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
R2_BUCKET_NAME=bucketdrive-dev
APP_URL=http://localhost:5173
API_URL=http://localhost:8787
PLATFORM_OWNER_EMAIL=voce@example.com
```

## Banco local

```bash
pnpm db:reset:empty
```

Use `pnpm db:reset:empty` para testar o fluxo real de onboarding. Use `pnpm db:reset` quando quiser dados de exemplo.

Depois de resetar o D1 local, reinicie `pnpm dev` para o Wrangler reabrir o banco.

## Servidores

```bash
pnpm dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8787`

## CORS do R2

Para uploads diretos pelo navegador:

```bash
pnpm r2:cors:dev
```

Esse comando aplica `docs/storage/r2-cors.dev.json` no bucket definido em `R2_BUCKET_NAME`.
