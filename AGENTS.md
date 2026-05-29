# AGENTS.md — BucketDrive

## Quick start

```bash
pnpm install
cp .env.example .dev.vars       # must fill in BETTER_AUTH_SECRET + at least one OAuth
pnpm env:link                   # links apps/api/.env and apps/api/.dev.vars to .dev.vars
pnpm db:reset                    # rm local Wrangler D1 → migrate → seed
pnpm dev                         # Vite :5173 + Wrangler :8787
```

## Monorepo layout (pnpm workspaces + Turborepo)

| Path | Role |
|---|---|
| `apps/web/` | React 19 SPA (Vite, Tailwind v4, TanStack Router, TanStack Query, Zustand) |
| `apps/api/` | Hono API on Cloudflare Workers (Wrangler) |
| `packages/shared/` | Drizzle schema, Zod contracts, shared types. Entrypoint: `src/index.ts` |
| `scripts/` | `migrate.ts`, `seed.ts` |
| `agents/` | Agent prompt files (frontend/backend/security) — not runtime code |
| `docs/` | Architecture docs and ADRs |

`tooling/` is reserved but currently empty.

## Developer commands

```bash
pnpm dev              # turbo dev → Vite + Wrangler (persistent, no cache)
pnpm build            # turbo build (required before lint/typecheck/test)
pnpm lint             # ESLint (dependsOn ^build — must build first)
pnpm typecheck        # tsc --noEmit (dependsOn ^build — must build first)
pnpm test:unit        # Vitest unit — no build prerequisite
pnpm test:contracts   # Vitest contract tests — no build prerequisite
pnpm test:e2e         # Playwright E2E
pnpm format           # Prettier (--write .)
pnpm format:check
```

**Important command order for CI-style checks:** `pnpm build` first, then `pnpm lint && pnpm typecheck`.

## Database

- **Dev:** Wrangler D1 local at `.wrangler/state/v3/d1`
- **Prod:** Cloudflare D1
- **Migrations:** Drizzle Kit, config in `packages/shared/drizzle.config.ts`

```bash
pnpm db:generate          # Drizzle Kit: schema → migration files
pnpm db:migrate:dev       # wrangler d1 migrations apply bucketdrive-db --local
pnpm db:seed              # tsx scripts/seed.ts → seed local Wrangler D1
pnpm db:reset             # rm -rf .wrangler/state/v3/d1 + migrate + seed
pnpm db:reset:empty       # rm -rf .wrangler/state/v3/d1 + migrate
pnpm db:studio            # Drizzle Studio (persistent, no cache)
```

## TypeScript quirks

- `noUncheckedIndexedAccess` is on — array/tuple access returns `T | undefined`
- `noUncheckedSideEffectImports` is on — imports must be used or `import "x"` style
- `tsconfig.json` paths: `@bucketdrive/shared` → `./packages/shared/src`
- `noEmit: true` — build for typecheck only; real bundling is Vite/Wrangler
- All sub-packages (`apps/*`, `packages/*`) have their own tsconfigs referenced in root ESLint

## ESLint

- `typescript-eslint` `strictTypeChecked` config
- `consistent-type-imports` with `separate-type-imports` fix style
- `no-console` warn (allows `.warn()` and `.error()`)
- Ignores: `dist`, `.turbo`, `node_modules`, `.wrangler`

## Prettier

- No semicolons, double quotes, trailing commas, printWidth 100
- `prettier-plugin-tailwindcss` for Tailwind v4 class sorting
- `pnpm format` formats everything; `pnpm format:check` is the CI check

## RBAC & Storage (hard rules from PROJECT_RULES.md)

```ts
// Forbidden:
if (user.role === "admin") { ... }
r2.put(key, body)

// Required:
can(user, "files.delete")
storageProvider.upload({ key, body })
```

- API contracts live in `packages/shared/src/contracts/` (Zod schemas)
- Backend is sole source of truth — never trust frontend auth state
- Dark mode mandatory for all components
- No inline styles — Tailwind or design tokens only

## Conventional commits

```
<type>(<scope>): <description>
```
Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `style`, `ci`

Branch pattern: `feat/description`, `fix/description`, `docs/description`, etc.

**After every implementation day:** update `docs/architecture/implementation-roadmap.md` with completed status and implementation notes, then commit all changes.

## Testing

- Unit tests: co-located `*.test.ts` files, Vitest
- Contract tests: `apps/api/src/__tests__/contracts/`, Vitest, test D1 seeded per file
- E2E: `apps/web/e2e/`, Playwright
- No vitest/playwright config files found yet (expected at some point)

## Entrypoints

- **API Worker:** `apps/api/src/index.ts` (matches `main` in `wrangler.toml`)
- **Frontend:** Vite-based SPA in `apps/web/`
- **Shared package:** `packages/shared/src/index.ts`
- **Workers (prod only):** `apps/workers/src/index.ts`
