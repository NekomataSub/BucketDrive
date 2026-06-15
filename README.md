# BucketDrive

Modern cloud storage platform — a beautiful frontend for Cloudflare R2, inspired by Google Drive.

## Features

- **File explorer** — grid and list views, drag & drop, keyboard shortcuts, context menus
- **Multi-workspace** — isolate teams with RBAC (Owner, Admin, Editor, Viewer)
- **Sharing** — internal sharing with granular permissions, external links with password protection
- **Search** — full-text search with filters by type, tags, and favorites
- **Upload** — direct-to-R2 with multipart, progress tracking, and resumability
- **Themes** — light and dark mode with polished design tokens
- **Security** — HSTS, CSP, CORS, signed URLs, audit logging

## Tech Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Frontend   | React 19 + TypeScript + Vite        |
| Styling    | Tailwind CSS v4 + shadcn/ui         |
| Routing    | TanStack Router                     |
| State      | TanStack Query + Zustand            |
| Backend    | Cloudflare Workers + Hono           |
| Auth       | Better Auth (OAuth + credentials)   |
| Database   | Cloudflare D1 (prod) / SQLite (dev) |
| ORM        | Drizzle ORM + Drizzle Kit           |
| Storage    | Cloudflare R2                       |
| Monorepo   | Turborepo + pnpm workspaces         |
| Testing    | Vitest + Playwright                 |
| Validation | Zod (shared contracts)              |

## Documentation

| Document                                                      | Description                             |
| ------------------------------------------------------------- | --------------------------------------- |
| [Project Rules](PROJECT_RULES.md)                             | Rules, conventions, and stack decisions |
| [System Overview](docs/architecture/system-overview.md)       | High-level architecture                 |
| [Folder Structure](docs/architecture/folder-structure.md)     | Monorepo organization                   |
| [Data Model](docs/database/data-model.md)                     | Database schema                         |
| [API Contracts](docs/architecture/api-contracts.md)           | Endpoint catalog with Zod schemas       |
| [Authentication](docs/architecture/authentication.md)         | Better Auth integration                 |
| [RBAC](docs/backend/rbac.md)                                  | Permission system                       |
| [Storage](docs/storage/storage-provider.md)                   | R2 abstraction layer                    |
| [Upload System](docs/features/upload-system.md)               | File upload architecture                |
| [File Sharing](docs/features/file-sharing.md)                 | Sharing feature spec                    |
| [Workspace Management](docs/features/workspace-management.md) | Multi-tenant workspaces                 |
| [Trash System](docs/features/trash-system.md)                 | Soft delete and recovery                |
| [Search System](docs/frontend/search-system.md)               | Full-text search                        |
| [Command Palette](docs/frontend/command-palette.md)           | Ctrl+K commands                         |
| [Design System](docs/frontend/design-system.md)               | Design philosophy                       |
| [Design Tokens](docs/frontend/design-tokens.md)               | Concrete CSS values                     |
| [Security Headers](docs/security/security-headers.md)         | CSP, HSTS, CORS                         |
| [Error Codes](docs/architecture/error-codes.md)               | Error catalog                           |
| [Testing Strategy](docs/architecture/testing-strategy.md)     | Test pyramid                            |
| [CI/CD](docs/architecture/ci-cd.md)                           | Pipeline and deployments                |
| [Migration Strategy](docs/backend/migration-strategy.md)      | Database migrations                     |
| [ADRs](docs/decisions/)                                       | Architecture Decision Records           |

## Quick Start

```bash
# Prerequisites
node >= 20
pnpm >= 9
wrangler >= 3

# Clone and install
git clone https://github.com/your-org/bucketdrive
cd bucketdrive
pnpm install

# Set up environment
cp .env.example .dev.vars
pnpm env:link
# Edit .dev.vars with your local runtime and Cloudflare credentials

# Start development
pnpm db:reset:empty # Initialize empty Wrangler D1 local for onboarding
pnpm dev            # Starts frontend (Vite) + backend (Wrangler)
```

See [Development Setup](docs/architecture/development-setup.md) for detailed instructions.

## Scripts

```bash
pnpm dev            # Start all apps in dev mode
pnpm build          # Build all apps for production
pnpm lint           # Lint all packages
pnpm typecheck      # Type-check all packages
pnpm test:unit      # Run unit tests
pnpm test:contracts # Run API contract tests
pnpm test:e2e       # Run end-to-end tests
pnpm db:generate    # Generate Drizzle migrations
pnpm db:migrate:dev # Apply migrations to Wrangler D1 local
pnpm db:seed        # Seed Wrangler D1 local
pnpm db:reset:empty # Reset empty Wrangler D1 local for onboarding
pnpm db:studio      # Open Drizzle Studio
pnpm r2:verify      # Verify configured R2 S3 credentials
pnpm format         # Format code with Prettier
```

---

## Deploy

This project deploys to **Cloudflare** (Workers + D1 + R2 + Pages). You can deploy manually from your machine or automatically via **GitHub Actions**.

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Node.js](https://nodejs.org/) >= 20 and [pnpm](https://pnpm.io/) >= 9
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) >= 3 (`npm install -g wrangler`)
- GitHub repository (for CI/CD)

### 1. Get your Cloudflare Account ID

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. In the right sidebar of any domain or account page, copy your **Account ID**
3. Save it — you will need it for every token and configuration

### 2. Create a Cloudflare API Token

**Never use the Global API Key.** Create a scoped **Custom API Token** instead:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → My Profile (top-right) → **API Tokens**
2. Click **Create Token**
3. Select the **Custom token** template
4. Configure the minimum permissions:

| Resource                             | Permission           | Access |
| ------------------------------------ | -------------------- | ------ |
| Account > Cloudflare Workers Scripts | `Workers Scripts`    | `Edit` |
| Account > Cloudflare Pages           | `Cloudflare Pages`   | `Edit` |
| Account > D1                         | `D1`                 | `Edit` |
| Account > Workers R2 Storage         | `Workers R2 Storage` | `Edit` |

5. **Account Resources**: Include only your target account (do not select "All accounts")
6. Click **Continue to summary** → **Create Token**
7. **Copy the token immediately** — it is shown only once

> **Security tip**: scope one token for CI/CD (`CLOUDFLARE_API_TOKEN`) and another one for local development if you want to limit exposure. The production token is the most sensitive secret in the entire project.

### 3. Automated Infrastructure Setup (Recommended)

You can create the D1 database and R2 bucket automatically via GitHub Actions, and have the D1 database ID saved directly as a GitHub Environment Variable.

**Requirements:**

- Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as **Repository Secrets** in your GitHub repository
- The `wrangler.toml` already contains the correct database and bucket names

**Steps:**

1. Go to your repository → **Actions** → **Workflows** → **Setup Cloudflare Infrastructure**
2. Click **Run workflow** and select the environment (`staging` or `production`)
3. The workflow will:
   - Create the D1 database if it doesn't exist
   - Create the R2 bucket if it doesn't exist
   - Save the D1 `database_id` as a GitHub Environment Variable (`STAGING_D1_DATABASE_ID` or `PRODUCTION_D1_DATABASE_ID`)

> **Note**: The workflow only creates infrastructure. You still need to manually set up OAuth apps, R2 API tokens, CORS rules, and remaining secrets/variables (see steps below).

### 4. Manual: Create D1 Databases

If you prefer not to use the automated setup, create the databases manually:

```bash
# Staging
npx wrangler d1 create bucketdrive-db-staging

# Production
npx wrangler d1 create bucketdrive-db
```

Each command prints a `database_id`. **Save both IDs** — they will be used as `STAGING_D1_DATABASE_ID` and `PRODUCTION_D1_DATABASE_ID`.

### 5. Manual: Create R2 Buckets

If not created automatically:

```bash
# Staging
npx wrangler r2 bucket create bucketdrive-staging

# Production
npx wrangler r2 bucket create bucketdrive-files
```

### 6. Configure R2 CORS

Browser uploads send requests directly to `*.r2.cloudflarestorage.com`, so R2 needs its own CORS rules (separate from API CORS):

**Development (local):**

```bash
pnpm r2:cors:dev
```

**Staging / Production:**

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com) → R2 → select the bucket
2. Go to **Settings** → **CORS Policy**
3. Add a JSON policy like:

```json
[
  {
    "AllowedOrigins": ["https://staging.bucketdrive.dev", "https://drive.nekomata.moe"],
    "AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"]
  }
]
```

### 7. Create a Cloudflare Pages Project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages
2. Click **Create a project** → **Connect to Git** (or upload manually)
3. Name the project `bucketdrive` (or your preferred name)
4. Save the project name as `PAGES_PROJECT_NAME` in your environment variables

### 8. Set up OAuth Providers

For each environment, create a separate OAuth app (or use the same one if all share a public domain). The callback URL must match the environment's `APP_URL`.

**GitHub OAuth App (per environment):**

1. Go to GitHub → Settings → Developer settings → [OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - Homepage URL: `http://localhost:5173` (dev), `https://staging.bucketdrive.dev` (staging), `https://drive.nekomata.moe` (production)
   - Authorization callback URL: `http://localhost:5173/api/auth/callback/github` (dev), `https://staging.bucketdrive.dev/api/auth/callback/github` (staging), `https://drive.nekomata.moe/api/auth/callback/github` (production)
4. Copy the **Client ID** and generate a **Client Secret**

**Google OAuth Client (per environment):**

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Add the authorized redirect URI matching your environment:
   - `http://localhost:5173/api/auth/callback/google` (dev)
   - `https://staging.bucketdrive.dev/api/auth/callback/google` (staging)
   - `https://drive.nekomata.moe/api/auth/callback/google` (production)
4. Copy the **Client ID** and **Client Secret**

### 9. Fill in Environment Variables

Copy the example file and fill it with your credentials:

```bash
cp .env.example .dev.vars
```

The `.dev.vars` file is the **canonical local environment file**. Use `pnpm env:link` to make the API and Workers apps read from it.

For staging and production, create `.env.staging` and `.env.production` at the repository root. These are used by the `env:prepare:*` and `env:push:*` scripts to configure and deploy the remote environments.

**Variable reference (all files follow the same `.env.example` format):**

| Variable               | Required for               | Where to get it               | Sensitive? |
| ---------------------- | -------------------------- | ----------------------------- | ---------- |
| `APP_URL`              | local, staging, production | Your public frontend URL      | No         |
| `API_URL`              | local, staging, production | Your public API/worker URL    | No         |
| `BETTER_AUTH_SECRET`   | local, staging, production | Run `openssl rand -base64 64` | **Yes**    |
| `BETTER_AUTH_URL`      | local, staging, production | Same as `API_URL`             | No         |
| `GITHUB_CLIENT_ID`     | local, staging, production | GitHub OAuth App settings     | **Yes**    |
| `GITHUB_CLIENT_SECRET` | local, staging, production | GitHub OAuth App settings     | **Yes**    |

> **Note**: In GitHub Actions, these secrets must be named `GH_CLIENT_ID` and `GH_CLIENT_SECRET`
> because the `GITHUB_` prefix is reserved. The `.env` variable names remain `GITHUB_CLIENT_ID` and
> `GITHUB_CLIENT_SECRET` (the app expects these). The workflow maps `secrets.GH_CLIENT_ID` →
> `GITHUB_CLIENT_ID` when creating the `.env.staging` / `.env.production` files.

| Variable                    | Required for               | Where to get it                                                               | Sensitive? |
| --------------------------- | -------------------------- | ----------------------------------------------------------------------------- | ---------- |
| `GOOGLE_CLIENT_ID`          | local, staging, production | Google Cloud Console                                                          | **Yes**    |
| `GOOGLE_CLIENT_SECRET`      | local, staging, production | Google Cloud Console                                                          | **Yes**    |
| `CLOUDFLARE_ACCOUNT_ID`     | local, staging, production | Cloudflare Dashboard sidebar                                                  | **Yes**    |
| `CLOUDFLARE_API_TOKEN`      | local, staging, production | Cloudflare Dashboard -> API Tokens                                            | **Yes**    |
| `STAGING_D1_DATABASE_ID`    | staging                    | Output of `wrangler d1 create bucketdrive-db-staging`                         | No         |
| `PRODUCTION_D1_DATABASE_ID` | production                 | Output of `wrangler d1 create bucketdrive-db`                                 | No         |
| `R2_ACCESS_KEY_ID`          | local, staging, production | R2 Dashboard -> Manage R2 API Tokens                                          | **Yes**    |
| `R2_SECRET_ACCESS_KEY`      | local, staging, production | R2 Dashboard -> Manage R2 API Tokens                                          | **Yes**    |
| `R2_BUCKET_NAME`            | local, staging, production | Your bucket name (e.g., `bucketdrive-staging`)                                | No         |
| `R2_ENDPOINT`               | local, staging, production | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`                               | No         |
| `PLAYWRIGHT_BASE_URL`       | staging                    | Same as `APP_URL`                                                             | No         |
| `PAGES_PROJECT_NAME`        | staging, production        | Cloudflare Pages project name (e.g., `bucketdrive`)                           | No         |
| `PAGES_BRANCH`              | staging, production        | Pages branch name (e.g., `staging`)                                           | No         |
| `CUSTOM_DOMAIN`             | staging, production        | Custom domain attached to the Pages project (e.g., `staging.bucketdrive.dev`) | No         |
| `PLATFORM_OWNER_EMAIL`      | local, staging, production | Your admin email                                                              | No         |

> **Important**: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are **local/CI credentials** — they authenticate the Wrangler CLI. They are **never** pushed to the Workers as secrets. The `pnpm env:push:*` command explicitly skips these keys.

#### Custom domain provisioning source

The `Setup custom domain` step in GitHub Actions reads its values directly from the selected
GitHub Environment, because the workflow needs them before it can call the Cloudflare API:

| GitHub Actions value            | Configure as                                          | Used for                                      |
| ------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `vars.CUSTOM_DOMAIN`            | Environment variable in `staging` / `production`      | Hostname to attach to Cloudflare Pages        |
| `vars.PAGES_PROJECT_NAME`       | Environment variable in `staging` / `production`      | Pages project whose `*.pages.dev` target wins |
| `secrets.CLOUDFLARE_ACCOUNT_ID` | Repository secret, or environment secret in both envs | Cloudflare account scope                      |
| `secrets.CLOUDFLARE_API_TOKEN`  | Repository secret, or environment secret in both envs | Cloudflare API authentication                 |

These are **deploy-time** values. They are not read from Cloudflare Worker runtime secrets,
Cloudflare Pages environment variables, or the already deployed app/API environment. The runtime
secrets pushed by `pnpm env:push:*` are only available to Workers after deployment and cannot be
used by GitHub Actions to provision DNS or Pages domains.

### 10. Manual Deploy (One-time Setup)

Use these steps to deploy from your local machine. In production, prefer the GitHub Actions workflow instead.

**Staging:**

```bash
# 1. Verify your environment file
pnpm env:check:staging

# 2. Patch wrangler.toml with D1 IDs and URLs
pnpm env:prepare:staging

# 3. Push runtime secrets to Cloudflare (Better Auth, OAuth, R2)
pnpm env:push:staging

# 4. Apply D1 migrations
npx wrangler d1 migrations apply bucketdrive-db-staging --remote --env staging

# 5. Deploy the API Worker
npx wrangler deploy --env staging --config wrangler.toml

# 6. Deploy the background Workers
npx wrangler deploy --env staging --config apps/workers/wrangler.toml

# 7. Build the frontend
pnpm build

# 8. Deploy the frontend to Cloudflare Pages
npx wrangler pages deploy apps/web/dist --project-name=bucketdrive --branch=staging
```

**Production:**

Replace `staging` with `production` in all commands above. Use `PRODUCTION_D1_DATABASE_ID` and the production URLs.

### 11. GitHub Actions CI/CD

The repository includes three workflows that run automatically:

| Workflow                | Trigger                           | Purpose                                                   |
| ----------------------- | --------------------------------- | --------------------------------------------------------- |
| `ci.yml`                | Pull request / push to `main`     | Lint, typecheck, unit tests, contract tests, bundle check |
| `deploy-staging.yml`    | Push to `main` / manual dispatch  | Deploy API, Workers, frontend, and run E2E on staging     |
| `deploy-production.yml` | Push of `v*` tag (e.g., `v1.0.0`) | Deploy to production with manual approval                 |

#### 10.1. Configure GitHub Environments

1. Go to your repository → **Settings** → **Environments**
2. Create **New environment** named `staging`
3. Create **New environment** named `production`
4. For `production`, add **Protection rules**:
   - Check **Required reviewers** and select at least one trusted person
   - (Optional) Enable **Prevent self-review**

#### 10.2. Configure GitHub Secrets and Variables

**Repository Secrets** (shared by all workflows):

Go to **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret                  | Value                      |
| ----------------------- | -------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Your Cloudflare API Token  |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID |

**Staging Environment Secrets** (go to Environment → `staging` → **Add secret**):

| Secret                 | Value                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`   | Random 64-char string                                                                            |
| `BETTER_AUTH_URL`      | `https://staging-api.bucketdrive.dev`                                                            |
| `GH_CLIENT_ID`         | GitHub OAuth Client ID (save as `GH_CLIENT_ID` in GitHub — `GITHUB_` prefix is reserved)         |
| `GH_CLIENT_SECRET`     | GitHub OAuth Client Secret (save as `GH_CLIENT_SECRET` in GitHub — `GITHUB_` prefix is reserved) |
| `GOOGLE_CLIENT_ID`     | Google OAuth Client ID                                                                           |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret                                                                       |
| `R2_ACCESS_KEY_ID`     | R2 API Token ID                                                                                  |
| `R2_SECRET_ACCESS_KEY` | R2 API Token Secret                                                                              |
| `R2_BUCKET_NAME`       | `bucketdrive-staging`                                                                            |
| `R2_ENDPOINT`          | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`                                                  |
| `PLATFORM_OWNER_EMAIL` | `admin@example.com`                                                                              |

**Staging Environment Variables** (go to Environment → `staging` → **Add variable**):

| Variable                 | Value                                 |
| ------------------------ | ------------------------------------- |
| `STAGING_D1_DATABASE_ID` | D1 staging database ID                |
| `APP_URL`                | `https://staging.bucketdrive.dev`     |
| `API_URL`                | `https://staging-api.bucketdrive.dev` |
| `PLAYWRIGHT_BASE_URL`    | `https://staging.bucketdrive.dev`     |
| `PAGES_PROJECT_NAME`     | `bucketdrive`                         |
| `PAGES_BRANCH`           | `staging`                             |
| `CUSTOM_DOMAIN`          | `staging.bucketdrive.dev`             |

**Production Environment Secrets and Variables** — same pattern, but use the production URLs and `PRODUCTION_D1_DATABASE_ID`.

> **Note**: GitHub Actions creates the `.env.staging` / `.env.production` files dynamically from these secrets/variables before running the deploy commands. The `pnpm env:push:*` command reads the file and runs `wrangler secret put` for each key.

The Cloudflare API token used by GitHub Actions must include the permissions required by Wrangler
plus `Pages Write`, `Zone Read`, and `DNS Write` so the deploy can attach the Pages custom domain
and create or update the matching CNAME record. Full DNS automation assumes the domain's DNS zone is
in the same Cloudflare account as the Pages project.

### Rollback

| Component            | Rollback command                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------- |
| **Pages (frontend)** | `npx wrangler pages deployment rollback --project-name=<name>` or revert commit + re-deploy |
| **Worker (API)**     | `npx wrangler rollback --env <staging\|production>`                                         |
| **D1 Migration**     | Deploy a new migration that reverses the change (no automatic rollback)                     |

---

## License

MIT
