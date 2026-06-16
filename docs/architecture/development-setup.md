# Development Setup

# Purpose

This document provides step-by-step instructions for setting up the project locally.

---

# Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Cloudflare Wrangler** >= 3.0.0 (`npm install -g wrangler`)
- **Cloudflare Account** (free tier works for development)
- **GitHub OAuth App** or **Google OAuth Client** (for Better Auth social login)

---

# Initial Setup

## 1. Clone the repository

```bash
git clone https://github.com/your-org/bucketdrive
cd bucketdrive
```

## 2. Install dependencies

```bash
pnpm install
```

## 3. Set up environment variables

```bash
cp .env.example .dev.vars
pnpm env:link
```

Edit `.dev.vars` with your credentials. It is the canonical local env file; `pnpm env:link`
points API and Workers `.env`/`.dev.vars` files at the same file so Wrangler, local scripts, and
legacy tooling read one set of values.

```env
# Better Auth
BETTER_AUTH_SECRET=<generate: openssl rand -base64 64>
BETTER_AUTH_URL=http://localhost:8787

# OAuth Providers (pick at least one)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Cloudflare
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token

# R2
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=bucketdrive-dev
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com

# App
APP_URL=http://localhost:5173
API_URL=http://localhost:8787
API_WORKER_URL=http://localhost:8787
PLATFORM_OWNER_EMAIL=you@example.com
```

For direct browser uploads and previews in local development, apply the R2 bucket CORS rules once:

```bash
pnpm r2:cors:dev
```

The command reads `R2_BUCKET_NAME` from your local env files and applies
`docs/storage/r2-cors.dev.json` to that bucket. Run it again whenever you change buckets.

Without this, R2 will reject browser preflight requests from the local Vite origin even when the
signed URL and credentials are valid. API CORS and R2 bucket CORS are separate settings; the browser
upload uses the R2 bucket's CORS rules because it sends `PUT` directly to `*.r2.cloudflarestorage.com`.

Useful env commands:

```bash
pnpm env:check              # verify required local runtime keys in .dev.vars
pnpm env:link               # recreate API/Workers env links to .dev.vars
pnpm env:check:staging      # verify staging deploy/runtime keys from .env.staging or process env
pnpm env:prepare:staging    # fill staging Wrangler IDs/URLs from env values
pnpm env:push:staging       # push runtime vars to API and Workers staging secrets
pnpm env:check:production   # verify production deploy/runtime keys from .env.production or process env
pnpm env:prepare:production # fill production Wrangler IDs/URLs from env values
pnpm env:push:production    # push runtime vars to API and Workers production secrets
```

For deploys, prefer `.env.staging` and `.env.production` for environment-specific values. GitHub
Actions uses GitHub Secrets/Vars with the same names instead of importing a local env file. The push
commands skip local CLI credentials such as `CLOUDFLARE_API_TOKEN` and only send app runtime vars.

## 4. Initialize the database

```bash
# Real setup: create an empty local database and use onboarding
pnpm db:reset:empty

# Demo setup: create local data with fake users/files
pnpm db:reset
```

`pnpm db:reset` seeds a default workspace and sample metadata, so authenticated users who are
already members will not see onboarding. Use `pnpm db:reset:empty` when testing the real first-run
flow. The first OAuth user whose email matches `PLATFORM_OWNER_EMAIL` becomes the platform admin and
can create the first workspace.

Existing R2 objects are not visible until BucketDrive has database metadata for them. After creating
the first workspace, use **Import R2** in the Files page to index existing bucket objects while
preserving their key paths as folders.

The dev server must be restarted after `db:reset` or `db:reset:empty` so Wrangler reopens the new
local D1 database. The local D1 files live under `.wrangler/state/v3/d1`.

## 5. Start development servers

```bash
# Start both frontend and backend
pnpm dev
```

This runs:

- **Frontend**: `http://localhost:5173` (Vite dev server with HMR)
- **Backend**: `http://localhost:8787` (Wrangler dev server with live reload)

---

# OAuth Setup

## GitHub OAuth App

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Set:
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:5173/api/auth/callback/github`
4. Copy Client ID and Client Secret to `.dev.vars`

## Google OAuth Client

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URI: `http://localhost:5173/api/auth/callback/google`
4. Copy Client ID and Client Secret to `.dev.vars`

The frontend runs on Vite at `http://localhost:5173` and proxies `/api/*` requests to Wrangler
at `http://localhost:8787`. Open the app on port `5173`; the Worker port is API-only.

---

# Database Commands

```bash
pnpm db:generate     # Generate migration from schema changes
pnpm db:migrate:dev  # Apply migrations to Wrangler D1 local
pnpm db:seed         # Seed Wrangler D1 local
pnpm db:studio       # Open Drizzle Studio (http://localhost:4983)
pnpm db:reset        # Delete + recreate seeded local D1
pnpm db:reset:empty  # Delete + recreate empty local D1 for onboarding
pnpm r2:verify       # Verify configured R2 S3 credentials can list the bucket
```

---

# Testing

```bash
pnpm test:unit       # Unit tests (Vitest)
pnpm test:contracts  # API contract tests
pnpm test:e2e        # E2E tests (Playwright; local runs use E2E_TEST_AUTH fixtures)
pnpm test:a11y       # Accessibility checks (Playwright + axe-core)
pnpm perf:check      # Build + bundle budget + Lighthouse CI
pnpm perf:benchmark  # 10,000-file Explorer benchmark
```

See [Testing Strategy](testing-strategy.md) for details.

---

# Code Quality

```bash
pnpm lint            # Run ESLint on all packages
pnpm typecheck       # Run TypeScript type checking
pnpm format          # Format code with Prettier
pnpm format:check    # Check formatting without writing
```

---

# Building for Production

```bash
pnpm build           # Build all apps

# Deploy to Cloudflare (staging)
STAGING_D1_DATABASE_ID=<database-id> pnpm env:prepare:staging
pnpm env:check:staging
pnpm db:migrate:staging
pnpm --filter @bucketdrive/api exec wrangler --config ../../wrangler.toml deploy --env staging
pnpm --filter @bucketdrive/api exec wrangler pages deploy ../../apps/web/dist --project-name bucketdrive --branch staging

# Deploy to production (via CI, triggered by v* tag)
pnpm --filter @bucketdrive/api exec wrangler --config ../../wrangler.toml deploy --env production
```

See [CI/CD](ci-cd.md) for the full pipeline.

---

# Project Structure

```txt
BucketDrive/
├── apps/
│   ├── web/              # Frontend (React + Vite)
│   │   ├── src/
│   │   │   ├── components/   # ui/, layout/, features/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── routes/
│   │   │   └── stores/
│   │   └── ...
│   ├── api/              # Backend (Hono + Workers)
│   │   ├── src/
│   │   │   ├── modules/      # Domain modules (files, shares, etc.)
│   │   │   ├── middleware/
│   │   │   ├── services/
│   │   │   └── lib/          # Auth, DB, storage
│   │   └── .db/local.sqlite
│   └── workers/          # Background jobs (future)
├── packages/
│   └── shared/           # Types, Zod schemas, Drizzle schema
├── docs/                 # Documentation
├── scripts/              # Dev scripts (migrate, seed)
├── agents/               # Agent definitions
└── tooling/              # Shared ESLint/Prettier configs
```

---

# Troubleshooting

## `wrangler dev` fails with R2 binding error

Make sure your `wrangler.toml` has correct R2 bucket bindings and that the bucket exists:

```bash
npx wrangler r2 bucket create bucketdrive-dev
```

## D1 migrations fail

```bash
# Reset and re-apply migrations
pnpm db:reset:empty
```

Wrangler dev stores local D1 data under `.wrangler/state/v3/d1`. Removing only
`apps/api/.db/local.sqlite` will not reset the database used by `pnpm dev`.

## OAuth callback URL mismatch

Verify the callback URLs exactly match:

- GitHub: `http://localhost:8787/api/auth/callback/github`
- Google: `http://localhost:8787/api/auth/callback/google`

## Better Auth session not persisting

Check that `BETTER_AUTH_SECRET` is set and consistent between restarts.
The session cookie requires HTTPS in production but works on `localhost` HTTP.

---

# References

- [README](/README.md)
- [Project Rules](/PROJECT_RULES.md)
- [Architecture Overview](system-overview.md)
- [Migration Strategy](../backend/migration-strategy.md)
- [Testing Strategy](testing-strategy.md)
- [CI/CD](ci-cd.md)
