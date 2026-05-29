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

# GitHub Actions Workflow

## `ci.yml` — Pull Request Checks

Triggered on: `pull_request` to `main`

```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm typecheck

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test:unit

  test-contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test:contracts

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm build
```

## `deploy-staging.yml` — Auto Deploy to Staging

Triggered on: `push` to `main`

```yaml
name: Deploy Staging
on:
  push:
    branches: [main]

jobs:
  migrate-d1:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - name: Apply D1 Migrations
        run: npx wrangler d1 migrations apply bucketdrive-db-staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}

  deploy-worker:
    needs: migrate-d1
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - name: Deploy Worker
        run: npx wrangler deploy --env staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}

  deploy-pages:
    needs: deploy-worker
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - name: Build Frontend
        run: pnpm build:web
      - name: Deploy Pages
        run: npx wrangler pages deploy apps/web/dist --project-name bucketdrive --branch staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}

  e2e:
    needs: deploy-pages
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test:e2e
        env:
          STAGING_URL: ${{ vars.STAGING_URL }}

```

## `deploy-prod.yml` — Production Deploy

Triggered on: `push` of `v*` tag (e.g., `v1.0.0`)

Same structure as staging but targets `--env production` and production D1 database.

Requires manual approval step (GitHub Environments protection rule).

---

# Environments

| Environment | Frontend URL | Worker URL | D1 Database | Purpose |
|---|---|---|---|---|
| **Development** | `http://localhost:5173` | `http://localhost:8787` | Local SQLite file | Active development |
| **Staging** | `https://staging.bucketdrive.dev` | `staging-api.bucketdrive.dev` | `bucketdrive-db-staging` | Pre-release testing |
| **Production** | `https://bucketdrive.app` | `api.bucketdrive.app` | `bucketdrive-db` | Live users |

---

# Environment Variables

### Frontend (`apps/web`)

```
VITE_API_URL=https://api.bucketdrive.app
VITE_APP_NAME=BucketDrive
```

Vite prefixes all client-side env vars with `VITE_`.

### Backend (`apps/api`)

```
# .env.staging / .env.production, then pnpm env:push:staging or pnpm env:push:prod

# Better Auth
BETTER_AUTH_SECRET=<random-64-char>
BETTER_AUTH_URL=https://api.bucketdrive.app
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# R2
R2_BUCKET_NAME=bucketdrive-files
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com

# D1
D1_DATABASE_ID=... # bound via wrangler.toml [[d1_databases]]

# App
APP_URL=https://bucketdrive.app
API_URL=https://api.bucketdrive.app
PLATFORM_OWNER_EMAIL=admin@example.com
```

`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are local/CI deploy credentials, not Worker
runtime vars, so `pnpm env:push:*` does not upload them as secrets.

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

| Component | Rollback |
|---|---|
| **Pages (Frontend)** | `wrangler pages deployment rollback` or revert commit + re-deploy |
| **Worker (API)** | `wrangler rollback` to previous deployment |
| **D1 Migration** | Deploy a new migration that reverses the change (no auto-rollback) |

Migrations are append-only. If a migration breaks production, deploy a *fix migration*.
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
