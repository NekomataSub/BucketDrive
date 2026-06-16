# BucketDrive

Plataforma moderna de armazenamento em nuvem, com frontend para Cloudflare R2 inspirado no Google Drive.

## Recursos

- **Explorador de arquivos**: visualizacao em grade/lista, arrastar e soltar, atalhos e menus de contexto
- **Administracao de bucket unico**: um drive apoiado por R2 com RBAC
- **Compartilhamento**: links internos e externos com senha
- **Busca**: pesquisa por texto, tipo, tags e favoritos
- **Upload**: envio direto ao R2 com multipart, progresso, retentativas e cancelamento
- **Temas**: modo claro e escuro
- **Seguranca**: HSTS, CSP, CORS, URLs assinadas e auditoria

## Stack

| Camada    | Tecnologia                   |
| --------- | ---------------------------- |
| Frontend  | React 19 + TypeScript + Vite |
| Estilos   | Tailwind CSS v4              |
| Rotas     | TanStack Router              |
| Estado    | TanStack Query + Zustand     |
| Backend   | Cloudflare Workers + Hono    |
| Auth      | Better Auth                  |
| Banco     | Cloudflare D1 / SQLite local |
| ORM       | Drizzle ORM                  |
| Storage   | Cloudflare R2                |
| Monorepo  | Turborepo + pnpm workspaces  |
| Testes    | Vitest + Playwright          |
| Validacao | Zod                          |

## Documentacao em pt-BR

| Documento                                                                     | Descricao                  |
| ----------------------------------------------------------------------------- | -------------------------- |
| [Setup de desenvolvimento](docs/pt-BR/architecture/development-setup.md)      | Como rodar localmente      |
| [Visao geral do sistema](docs/pt-BR/architecture/system-overview.md)          | Arquitetura de alto nivel  |
| [Autenticacao](docs/pt-BR/architecture/authentication.md)                     | Integracao Better Auth     |
| [Contratos de API](docs/pt-BR/architecture/api-contracts.md)                  | Padroes de endpoints e Zod |
| [Roadmap de implementacao](docs/pt-BR/architecture/implementation-roadmap.md) | Status e proximos passos   |

Documentos ainda nao traduzidos continuam disponiveis em [docs/](docs/).

## Inicio rapido

```bash
pnpm install
cp .env.example .dev.vars
pnpm env:link
pnpm db:reset:empty
pnpm dev
```

O frontend roda em `http://localhost:5173` e o backend em `http://localhost:8787`.

## Comandos principais

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:contracts
pnpm test:e2e
pnpm db:generate
pnpm db:migrate:dev
pnpm db:seed
pnpm db:reset:empty
pnpm format:check
```
