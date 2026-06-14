# CI/CD Pipeline

# Purpose

This document defines the continuous integration and deployment pipeline.

The pipeline must:

- Guarantee that only passing code reaches production
- Deploy frontend and backend independently
- Run database migrations safely
- Provide fast feedback to developers (PR checks < 5 minutes)
- Support multiple environments (dev, staging, production)

---

# Pipeline Overview

```txt
Developer Push
    ↓
Pre-commit Hook (local)
    ├── lint-staged (ESLint + Prettier)
    └── typecheck (staged files)
    ↓
GitHub Actions (CI)
    ├── Lint (ESLint)
    ├── Typecheck (tsc --noEmit)
    ├── Unit Tests (Vitest)
    ├── Contract Tests (Vitest + test D1)
    └── Build Check (vite build + wrangler deploy --dry-run)
    ↓
PR Merge to main
    ↓
Staging Deploy (automatic)
    ├── D1 migrations → staging DB
    ├── Worker deploy → staging
    └── Pages deploy → staging
    ↓
E2E Tests (Playwright) on staging
    ↓
Manual QA / Approval
    ↓
Production Deploy (tag push: v*)
    ├── D1 migrations → production DB
    ├── Worker deploy → production
    └── Pages deploy → production
```

---

# GitHub Actions Workflows

Workflow files are versioned in `.github/workflows/`.

## `ci.yml` — Pull Request Checks

Triggered on `pull_request` to `main` and `push` to `main`.

Runs:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:contracts
pnpm perf:bundle
```

`pnpm build` intentionally runs before lint/typecheck because Turbo config makes those tasks depend
on upstream package builds.

## `deploy-staging.yml` — Auto Deploy to Staging

Triggered on `push` to `main` and `workflow_dispatch`.

Uses the `staging` GitHub Environment and requires the following secrets/variables:

| Type                 | Key                      | Purpose                          |
| -------------------- | ------------------------ | -------------------------------- |
| Repository secret    | `CLOUDFLARE_API_TOKEN`   | Wrangler CLI authentication      |
| Repository secret    | `CLOUDFLARE_ACCOUNT_ID`  | Wrangler CLI account scope       |
| Environment variable | `STAGING_D1_DATABASE_ID` | Fills `wrangler.toml` D1 binding |
| Environment variable | `APP_URL`                | Frontend URL                     |
| Environment variable | `API_URL`                | Worker URL                       |
| Environment variable | `PLAYWRIGHT_BASE_URL`    | E2E target URL                   |
| Environment variable | `PAGES_PROJECT_NAME`     | Cloudflare Pages project name    |
| Environment variable | `PAGES_BRANCH`           | Pages branch name                |
| Environment secret   | `BETTER_AUTH_SECRET`     | Better Auth session key          |
| Environment secret   | `BETTER_AUTH_URL`        | Same as `API_URL`                |
| Environment secret   | `GITHUB_CLIENT_ID`       | OAuth app credentials            |
| Environment secret   | `GITHUB_CLIENT_SECRET`   | OAuth app credentials            |
| Environment secret   | `GOOGLE_CLIENT_ID`       | OAuth client credentials         |
| Environment secret   | `GOOGLE_CLIENT_SECRET`   | OAuth client credentials         |
| Environment secret   | `R2_ACCESS_KEY_ID`       | R2 S3 API token                  |
| Environment secret   | `R2_SECRET_ACCESS_KEY`   | R2 S3 API token                  |
| Environment secret   | `R2_BUCKET_NAME`         | R2 bucket name                   |
| Environment secret   | `R2_ENDPOINT`            | R2 S3 endpoint                   |
| Environment secret   | `PLATFORM_OWNER_EMAIL`   | First admin email                |

The workflow runs:

1. `pnpm env:check:staging` — validates that all required keys are present
2. `pnpm env:prepare:staging` — patches `wrangler.toml` files with the D1 ID and URLs
3. `wrangler d1 migrations apply --remote --env staging` — applies database migrations to the remote staging database
4. `wrangler deploy --env staging` (API Worker) — deploys the API Worker
5. `wrangler deploy --env staging` (Workers) — deploys the background Workers
6. `pnpm build` — builds the frontend
7. `wrangler pages deploy` — deploys the built frontend to Cloudflare Pages
8. `pnpm env:push:staging` — pushes runtime secrets to Cloudflare Workers secret store
9. `pnpm test:e2e` — runs Playwright E2E tests against the staging URL
10. `pnpm test:a11y` — runs accessibility checks

## `deploy-production.yml` — Production Deploy

Triggered on: `push` of `v*` tag (e.g., `v1.0.0`)

Same structure as staging but:

- Uses the `production` GitHub Environment
- Uses `PRODUCTION_D1_DATABASE_ID` instead of `STAGING_D1_DATABASE_ID`
- Targets `--env production` for all Wrangler commands
- Uses production URLs

Requires **manual approval** via GitHub Environment protection rules.

---

# Environments

| Environment     | Frontend URL                      | Worker URL                            | D1 Database              | Purpose             |
| --------------- | --------------------------------- | ------------------------------------- | ------------------------ | ------------------- |
| **Development** | `http://localhost:5173`           | `http://localhost:8787`               | Local Wrangler D1        | Active development  |
| **Staging**     | `https://staging.bucketdrive.dev` | `https://staging-api.bucketdrive.dev` | `bucketdrive-db-staging` | Pre-release testing |
| **Production**  | `https://drive.nekomata.moe`      | `https://drive.nekomata.moe/api`      | `bucketdrive-db`         | Live users          |

---

# Environment Variables

## Local Development

The canonical local file is `.dev.vars` at the repository root. Use `pnpm env:link` to create
symlinks so that `apps/api/` and `apps/workers/` also read from it.

```bash
cp .env.example .dev.vars
pnpm env:link
# Edit .dev.vars with your credentials
```

## CI/CD (GitHub Actions)

GitHub Actions does not read `.env` files. Instead, it creates a temporary `.env.staging` or
`.env.production` file dynamically from the environment secrets and variables configured in the
GitHub repository settings.

### Required Repository Secrets

| Secret                  | Source                            |
| ----------------------- | --------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare Dashboard → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → Account ID |

### Required Environment Variables

| Variable                    | Staging                                         | Production                              |
| --------------------------- | ----------------------------------------------- | --------------------------------------- |
| `STAGING_D1_DATABASE_ID`    | `npx wrangler d1 create bucketdrive-db-staging` | —                                       |
| `PRODUCTION_D1_DATABASE_ID` | —                                               | `npx wrangler d1 create bucketdrive-db` |
| `APP_URL`                   | `https://staging.bucketdrive.dev`               | `https://drive.nekomata.moe`            |
| `API_URL`                   | `https://staging-api.bucketdrive.dev`           | `https://drive.nekomata.moe/api`        |
| `PLAYWRIGHT_BASE_URL`       | Same as `APP_URL`                               | Same as `APP_URL`                       |
| `PAGES_PROJECT_NAME`        | `bucketdrive`                                   | `bucketdrive`                           |
| `PAGES_BRANCH`              | `staging`                                       | `production`                            |

### Required Environment Secrets

All of the following must be stored as **environment secrets** (not repository secrets) to ensure
they are scoped to the correct environment:

| Secret                 | How to obtain                                             |
| ---------------------- | --------------------------------------------------------- |
| `BETTER_AUTH_SECRET`   | `openssl rand -base64 64`                                 |
| `BETTER_AUTH_URL`      | Same as `API_URL`                                         |
| `GITHUB_CLIENT_ID`     | GitHub OAuth App → Client ID                              |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App → Client Secret                          |
| `GOOGLE_CLIENT_ID`     | Google Cloud Console → OAuth 2.0 Client ID                |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Client Secret                      |
| `R2_ACCESS_KEY_ID`     | Cloudflare R2 Dashboard → Manage R2 API Tokens → Token ID |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 Dashboard → Token Secret                    |
| `R2_BUCKET_NAME`       | Your bucket name                                          |
| `R2_ENDPOINT`          | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`           |
| `PLATFORM_OWNER_EMAIL` | Admin email address                                       |

> `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are **local/CI deploy credentials**, not
> Worker runtime vars. `pnpm env:push:*` explicitly skips these keys and never uploads them to
> Cloudflare's secret store.

## Setting up D1

Create the databases and capture the IDs:

```bash
npx wrangler d1 create bucketdrive-db-staging
npx wrangler d1 create bucketdrive-db
```

Store the returned `database_id` values as `STAGING_D1_DATABASE_ID` and `PRODUCTION_D1_DATABASE_ID`
environment variables in the respective GitHub Environments.

## Setting up R2

Create the buckets and API tokens:

```bash
npx wrangler r2 bucket create bucketdrive-staging
npx wrangler r2 bucket create bucketdrive-files
```

Then create an R2 API token in the Cloudflare Dashboard → R2 → Manage R2 API Tokens. The token
needs **Object Read & Write** permissions on the buckets. Save the **Access Key ID** and **Secret
Access Key** as `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.

---

# pre-commit Hooks

```json
// .husky/pre-commit
{
  "hooks": {
    "pre-commit": "lint-staged"
  }
}

// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yaml}": ["prettier --write"]
  }
}
```

---

# Build Process

## Frontend (`apps/web`)

```bash
vite build          # → apps/web/dist/
```

Static files deployed to Cloudflare Pages. No server runtime needed.

## Backend (`apps/api`)

```bash
wrangler deploy     # → Cloudflare Workers
```

Worker bundles Hono + Better Auth + Drizzle ORM. Deployed as a single Worker.

## Background Jobs (`apps/workers`)

```bash
wrangler deploy     # → Separate Worker (if needed for thumbnail gen, cleanup)
```

Separate Worker to avoid blocking API requests with heavy processing.

---

# Rollback Strategy

| Component            | Rollback                                                           |
| -------------------- | ------------------------------------------------------------------ |
| **Pages (Frontend)** | `wrangler pages deployment rollback` or revert commit + re-deploy  |
| **Worker (API)**     | `wrangler rollback` to previous deployment                         |
| **D1 Migration**     | Deploy a new migration that reverses the change (no auto-rollback) |

Migrations are append-only. If a migration breaks production, deploy a _fix migration_.
Never delete or modify committed migration files.

---

# Monitoring & Alerts

- Cloudflare Workers observability: request volume, error rate, latency (free in dashboard)
- Cloudflare Pages analytics: page views, bandwidth
- Error tracking: Workers `console.error` → Cloudflare Logpush (future: Sentry integration)
- Uptime monitoring: external health check on `GET /api/health`
- Alert on: error rate > 1%, latency > 500ms p95, deployment failures

---

# Branch Strategy

```
main           Production-ready code. Auto-deploys to staging.
  ├── feat/*   Feature branches. Deploy preview on Cloudflare Pages.
  ├── fix/*    Bug fix branches. Deploy preview.
  ├── docs/*   Documentation changes. No deploy needed.
  └── chore/*  Tooling, dependencies, CI changes.
```

- PR from `feat/*` → `main` triggers CI checks
- Merge to `main` triggers staging deploy + E2E
- Tag `v*` triggers production deploy (with manual approval)

---

# Security in CI

- Secrets stored in GitHub Secrets (never in code, never in config files)
- `wrangler.toml` uses environment variable references, not hardcoded values
- D1 migrations run with least-privilege API token (only D1 write access)
- Production deploy API tokens are scoped to production only
- No environment secrets accessible in PR workflows from forks

---

# References

- [Cloudflare Pages Deploy](https://developers.cloudflare.com/pages/configuration/deployments/)
- [Cloudflare Workers Deploy](https://developers.cloudflare.com/workers/wrangler/deploy/)
- [D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [GitHub Actions Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments)
