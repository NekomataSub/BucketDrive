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
PR Merge / Push to main
    ↓
Production Deploy (automatic)
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

## `deploy-staging.yml` — Manual Deploy to Staging

Triggered only by `workflow_dispatch`.

Uses the `staging` GitHub Environment and requires the following secrets/variables:

| Type                 | Key                        | Purpose                                                |
| -------------------- | -------------------------- | ------------------------------------------------------ |
| Repository secret    | `CLOUDFLARE_API_TOKEN`     | Wrangler CLI authentication                            |
| Repository secret    | `CLOUDFLARE_ACCOUNT_ID`    | Wrangler CLI account scope                             |
| Environment variable | `STAGING_D1_DATABASE_ID`   | Fills `wrangler.toml` D1 binding                       |
| Environment variable | `STAGING_D1_DATABASE_NAME` | Staging D1 database name                               |
| Environment variable | `APP_URL`                  | Frontend URL                                           |
| Environment variable | `API_URL`                  | Worker URL                                             |
| Environment variable | `PLAYWRIGHT_BASE_URL`      | E2E target URL for staging                             |
| Environment variable | `PAGES_PROJECT_NAME`       | Cloudflare Pages project name                          |
| Environment variable | `PAGES_BRANCH`             | Pages branch name                                      |
| Environment variable | `CUSTOM_DOMAIN`            | Optional Pages custom domain to auto-provision         |
| Environment variable | `PLATFORM_OWNER_EMAIL`     | First admin email                                      |
| Environment secret   | `BETTER_AUTH_SECRET`       | Better Auth session key                                |
| Environment secret   | `BETTER_AUTH_URL`          | Same as `API_URL`                                      |
| Environment secret   | `GH_CLIENT_ID`             | GitHub OAuth Client ID (GitHub prefix is reserved)     |
| Environment secret   | `GH_CLIENT_SECRET`         | GitHub OAuth Client Secret (GitHub prefix is reserved) |
| Environment secret   | `GOOGLE_CLIENT_ID`         | OAuth client credentials                               |
| Environment secret   | `GOOGLE_CLIENT_SECRET`     | OAuth client credentials                               |
| Environment secret   | `R2_ACCESS_KEY_ID`         | R2 S3 API token                                        |
| Environment secret   | `R2_SECRET_ACCESS_KEY`     | R2 S3 API token                                        |
| Environment secret   | `R2_BUCKET_NAME`           | R2 bucket name                                         |
| Environment secret   | `R2_ENDPOINT`              | R2 S3 endpoint                                         |

The workflow runs:

1. `pnpm env:check:staging` — validates that all required keys are present
2. `pnpm env:prepare:staging` — patches `wrangler.toml` files with the D1 ID and URLs
3. `wrangler d1 migrations apply --remote --env staging` — applies database migrations to the remote staging database
4. `wrangler deploy --env staging` (API Worker) — deploys the API Worker
5. `wrangler deploy --env staging` (Workers) — deploys the background Workers
6. `pnpm build` — builds the frontend
7. `wrangler pages deploy` — deploys the built frontend to Cloudflare Pages
8. `pnpm tsx scripts/setup-custom-domain.ts` — associates `CUSTOM_DOMAIN` with Pages and ensures
   the Cloudflare DNS CNAME exists, when `CUSTOM_DOMAIN` is configured
9. `pnpm env:push:staging` — pushes runtime secrets to Cloudflare Workers secret store
10. `pnpm test:e2e` — runs Playwright E2E tests against the staging URL
11. `pnpm test:a11y` — runs accessibility checks

## `deploy-production.yml` — Production Deploy

Triggered on `push` to `main` and `workflow_dispatch`.

Same structure as staging but:

- Uses the `production` GitHub Environment
- Uses `PRODUCTION_D1_DATABASE_ID` instead of `STAGING_D1_DATABASE_ID`
- Targets `--env production` for all Wrangler commands
- Uses production URLs

If the GitHub `production` Environment has protection rules, deployment waits for that approval.

---

# Environments

| Environment     | Frontend URL            | Worker URL              | D1 Database            | Purpose             |
| --------------- | ----------------------- | ----------------------- | ---------------------- | ------------------- |
| **Development** | `http://localhost:5173` | `http://localhost:8787` | Local Wrangler D1      | Active development  |
| **Staging**     | `APP_URL` env value     | `API_URL` env value     | Staging D1 name env    | Pre-release testing |
| **Production**  | `APP_URL` env value     | `API_URL` env value     | Production D1 name env | Live users          |

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

| Variable                    | Staging                                                | Production                                                |
| --------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `STAGING_D1_DATABASE_ID`    | Output of `wrangler d1 create <staging database name>` | —                                                         |
| `PRODUCTION_D1_DATABASE_ID` | —                                                      | Output of `wrangler d1 create <production database name>` |
| `APP_URL`                   | Staging frontend URL                                   | Production frontend URL                                   |
| `API_URL`                   | Staging API URL                                        | Production API URL                                        |
| `PLAYWRIGHT_BASE_URL`       | Same as `APP_URL`                                      | Not required                                              |
| `PAGES_PROJECT_NAME`        | Cloudflare Pages project name                          | Cloudflare Pages project name                             |
| `PAGES_BRANCH`              | `staging`                                              | `production`                                              |
| `CUSTOM_DOMAIN`             | Optional staging custom domain                         | Optional production custom domain                         |
| `PLATFORM_OWNER_EMAIL`      | Admin email address                                    | Admin email address                                       |

### Required Environment Secrets

All of the following must be stored as **environment secrets** (not repository secrets) to ensure
they are scoped to the correct environment:

| Secret               | How to obtain                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 64`                                                                              |
| `BETTER_AUTH_URL`    | Same as `API_URL`                                                                                      |
| `GH_CLIENT_ID`       | GitHub OAuth App → Client ID (save as `GH_CLIENT_ID` in GitHub — `GITHUB_` prefix is reserved)         |
| `GH_CLIENT_SECRET`   | GitHub OAuth App → Client Secret (save as `GH_CLIENT_SECRET` in GitHub — `GITHUB_` prefix is reserved) |

> The app expects `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as env variables. The workflow
> maps `secrets.GH_CLIENT_ID` to `GITHUB_CLIENT_ID` when creating the `.env.staging` /
> `.env.production` files.

| Secret                 | How to obtain                                               |
| ---------------------- | ----------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Google Cloud Console -> OAuth 2.0 Client ID                 |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console -> Client Secret                       |
| `R2_ACCESS_KEY_ID`     | Cloudflare R2 Dashboard -> Manage R2 API Tokens -> Token ID |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 Dashboard -> Token Secret                     |
| `R2_BUCKET_NAME`       | Your bucket name                                            |
| `R2_ENDPOINT`          | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`             |

> `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are **local/CI deploy credentials**, not
> Worker runtime vars. `pnpm env:push:*` explicitly skips these keys and never uploads them to
> Cloudflare's secret store.

### Custom Domain Provisioning Source

The `Setup custom domain` step reads configuration directly from the active GitHub Environment:

| GitHub Actions value            | Configure as                                          | Purpose                                |
| ------------------------------- | ----------------------------------------------------- | -------------------------------------- |
| `vars.CUSTOM_DOMAIN`            | Environment variable in `staging` / `production`      | Custom hostname to attach to Pages     |
| `vars.PAGES_PROJECT_NAME`       | Environment variable in `staging` / `production`      | Pages project and `*.pages.dev` target |
| `secrets.CLOUDFLARE_ACCOUNT_ID` | Repository secret, or environment secret in both envs | Cloudflare account scope               |
| `secrets.CLOUDFLARE_API_TOKEN`  | Repository secret, or environment secret in both envs | Cloudflare API authentication          |

These values are deploy-time configuration. They are not read from Cloudflare Worker runtime
secrets, Cloudflare Pages environment variables, or the app/API runtime environment. Runtime secrets
pushed by `pnpm env:push:*` are only available to Workers after deployment, so GitHub Actions cannot
use them to create DNS records or attach Pages custom domains.

Production deploys do not require `PLAYWRIGHT_BASE_URL` and do not run the full Playwright E2E/a11y
suite. Those tests depend on test-only `/api/e2e/*` routes and should run against staging or local
test environments. Production runs smoke checks against the frontend and API health endpoint after
deploy.

The Cloudflare API token used by the deploy workflows must include the existing Wrangler/D1/R2/
Workers permissions plus `Pages Write`, `Zone Read`, and `DNS Write`. Custom-domain automation
assumes the DNS zone for `CUSTOM_DOMAIN` lives in the same Cloudflare account as the Pages project.
For production, the same token must be able to update cron schedules for
`bucketdrive-workers-production`; the workflow validates the `/schedules` endpoint before deploying
the background Worker.

## Automated Infrastructure Setup

The `setup-infrastructure.yml` workflow creates Cloudflare resources (D1 databases and R2 buckets)
automatically via GitHub Actions and stores the D1 database IDs as GitHub Environment Variables.

**Trigger**: `workflow_dispatch` (manual) — Actions tab → **Setup Cloudflare Infrastructure** →
**Run workflow**.

**Required inputs**:

- `environment`: `staging` or `production`
- `CLOUDFLARE_API_TOKEN` (repository secret)
- `CLOUDFLARE_ACCOUNT_ID` (repository secret)

**What it does**:

1. Reads the target database name and bucket name from `wrangler.toml`
2. Checks if the D1 database exists via `wrangler d1 info`
3. Creates it if missing (`wrangler d1 create`)
4. Checks if the R2 bucket exists via `wrangler r2 bucket list`
5. Creates it if missing (`wrangler r2 bucket create`)
6. Stores the D1 `database_id` as a GitHub Environment Variable (`STAGING_D1_DATABASE_ID` or
   `PRODUCTION_D1_DATABASE_ID`)

> **What it does NOT do**: create OAuth apps, R2 API tokens, CORS rules, or remaining secrets. These
> must still be configured manually (see steps below).

## Setting up D1 (Manual)

If you prefer not to use the automated workflow, create the databases manually:

```bash
npx wrangler d1 create "<staging-d1-database-name>"
npx wrangler d1 create "<production-d1-database-name>"
```

Store the returned `database_id` values as `STAGING_D1_DATABASE_ID` and `PRODUCTION_D1_DATABASE_ID`
environment variables in the respective GitHub Environments.

## Setting up R2

Create the buckets and API tokens:

```bash
npx wrangler r2 bucket create "<staging-r2-bucket-name>"
npx wrangler r2 bucket create "<production-r2-bucket-name>"
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
main           Production-ready code. Auto-deploys to production.
  ├── feat/*   Feature branches. Deploy preview on Cloudflare Pages.
  ├── fix/*    Bug fix branches. Deploy preview.
  ├── docs/*   Documentation changes. No deploy needed.
  └── chore/*  Tooling, dependencies, CI changes.
```

- PR from `feat/*` → `main` triggers CI checks
- Merge or push to `main` triggers production deploy
- Staging deploys are available manually from the Actions tab via `workflow_dispatch`

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
