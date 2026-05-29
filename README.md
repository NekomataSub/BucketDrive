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

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Routing | TanStack Router |
| State | TanStack Query + Zustand |
| Backend | Cloudflare Workers + Hono |
| Auth | Better Auth (OAuth + credentials) |
| Database | Cloudflare D1 (prod) / SQLite (dev) |
| ORM | Drizzle ORM + Drizzle Kit |
| Storage | Cloudflare R2 |
| Monorepo | Turborepo + pnpm workspaces |
| Testing | Vitest + Playwright |
| Validation | Zod (shared contracts) |

## Documentation

| Document | Description |
|---|---|
| [Project Rules](PROJECT_RULES.md) | Rules, conventions, and stack decisions |
| [System Overview](docs/architecture/system-overview.md) | High-level architecture |
| [Folder Structure](docs/architecture/folder-structure.md) | Monorepo organization |
| [Data Model](docs/database/data-model.md) | Database schema |
| [API Contracts](docs/architecture/api-contracts.md) | Endpoint catalog with Zod schemas |
| [Authentication](docs/architecture/authentication.md) | Better Auth integration |
| [RBAC](docs/backend/rbac.md) | Permission system |
| [Storage](docs/storage/storage-provider.md) | R2 abstraction layer |
| [Upload System](docs/features/upload-system.md) | File upload architecture |
| [File Sharing](docs/features/file-sharing.md) | Sharing feature spec |
| [Workspace Management](docs/features/workspace-management.md) | Multi-tenant workspaces |
| [Trash System](docs/features/trash-system.md) | Soft delete and recovery |
| [Search System](docs/frontend/search-system.md) | Full-text search |
| [Command Palette](docs/frontend/command-palette.md) | Ctrl+K commands |
| [Design System](docs/frontend/design-system.md) | Design philosophy |
| [Design Tokens](docs/frontend/design-tokens.md) | Concrete CSS values |
| [Security Headers](docs/security/security-headers.md) | CSP, HSTS, CORS |
| [Error Codes](docs/architecture/error-codes.md) | Error catalog |
| [Testing Strategy](docs/architecture/testing-strategy.md) | Test pyramid |
| [CI/CD](docs/architecture/ci-cd.md) | Pipeline and deployments |
| [Migration Strategy](docs/backend/migration-strategy.md) | Database migrations |
| [ADRs](docs/decisions/) | Architecture Decision Records |

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
# Edit .dev.vars with your Cloudflare credentials

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

## License

MIT
