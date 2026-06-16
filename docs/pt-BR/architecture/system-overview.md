# Visao geral do sistema

BucketDrive e uma plataforma de armazenamento em bucket unico com frontend rico, API em Cloudflare Workers e objetos armazenados no Cloudflare R2.

## Escopo atual

A v1 gerencia um bucket padrao. Alguns caminhos ainda usam nomes como `workspaceId` por compatibilidade historica, mas a implementacao atual nao oferece workspaces isolados multiplos.

## Estrutura

```txt
apps/web      # React SPA
apps/api      # Hono API em Cloudflare Workers
apps/workers  # workers de background
packages/shared # schemas, contratos, RBAC e tipos
```

## Frontend

`apps/web` e responsavel por interface, navegacao, uploads, busca, compartilhamento e configuracoes. Ele nunca deve acessar banco ou storage diretamente.

Stack principal:

- React 19
- TypeScript
- Vite
- Tailwind CSS
- TanStack Router
- TanStack Query
- Zustand

## Backend

`apps/api` e a fonte de verdade para autenticacao, RBAC, metadados, compartilhamento, auditoria e URLs assinadas.

Regras importantes:

- nunca confiar no estado de auth do frontend
- usar `can(user, "permission")`, nao comparacoes diretas de role
- acessar storage por `storageProvider`, nao por `r2.put` direto

## Shared

`packages/shared` contem contratos Zod, schemas Drizzle, tipos compartilhados e politicas RBAC. Mudancas de API devem passar por esses contratos.
