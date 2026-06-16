# Migration Strategy

# Purpose

This document defines the database migration workflow for the platform.

The system uses **Drizzle Kit** for schema management with:

- SQLite via `better-sqlite3` for local development
- Cloudflare D1 for staging and production

The strategy ensures zero schema divergence between environments.

---

# Core Principles

## 1. Schema as Code

The canonical schema lives in `packages/shared/src/db/schema/` as Drizzle TypeScript definitions.
Migrations are generated from schema changes. Never write migrations manually.

## 2. Append-Only Migrations

Migrations are immutable once merged. To revert a change, create a new migration — never modify or
delete existing migration files.

## 3. Single Source of Truth

The Drizzle schema in TypeScript is the source of truth. Generated SQL migrations are
checked into version control for auditability and reproducibility.

---

# Directory Structure

```txt
packages/shared/
  src/
    db/
      schema/
        users.ts             # User, Session, Account (Better Auth schema)
        workspace.ts         # Bucket, BucketSettings, files, folders, invitations
        files.ts             # FileObject, Folder
        tags.ts              # FileTag, FileObjectTag, Favorite
        shares.ts            # ShareLink, SharePermission, ShareAccessAttempt
        audit.ts             # AuditLog
        uploads.ts           # UploadSession, UploadPart
        notifications.ts     # Notification
        index.ts             # Re-exports all tables
      migrations/            # Generated SQL files (checked into git)
        0000_init.sql
        0001_add_share_attempts.sql
        0002_add_workspace_settings.sql
      meta/                  # Drizzle Kit metadata (snapshot of schema state)
        _journal.json
        0000_snapshot.json
        0001_snapshot.json
        ...
      seeds/
        dev.ts               # Development seed data
        prod.ts              # Production seed data (roles, workspace defaults)
        fixtures.ts          # Shared test fixtures

scripts/
  migrate.ts                # Applies migrations to local SQLite
  seed.ts                   # Seedes local SQLite with dev data
  db-create.ts              # Creates initial D1 database (wrpers only)
```

---

# Schema Definition

```ts
// packages/shared/src/db/schema/files.ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"
import { workspace } from "./workspaces"

export const fileObject = sqliteTable("file_object", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  bucketId: text("bucket_id").notNull(),
  folderId: text("folder_id"),
  ownerId: text("owner_id").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  extension: text("extension"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  checksum: text("checksum"),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})
```

# Indexes are defined alongside the table:

```ts
import { index } from "drizzle-orm/sqlite-core"

export const fileObject = sqliteTable(
  "file_object",
  {
    // ... columns
  },
  (table) => ({
    workspaceIdx: index("idx_file_workspace").on(table.workspaceId),
    folderIdx: index("idx_file_folder").on(table.folderId),
    ownerIdx: index("idx_file_owner").on(table.ownerId),
    storageKeyIdx: index("idx_file_storage_key").on(table.storageKey),
    deletedIdx: index("idx_file_deleted").on(table.isDeleted),
    createdIdx: index("idx_file_created").on(table.createdAt),
  }),
)
```

---

# Migration Workflow

## Local Development

### 1. Edit schema

Edit the Drizzle TypeScript schema in `packages/shared/src/db/schema/`.

### 2. Generate migration

```bash
pnpm db:generate
```

This runs `drizzle-kit generate` which:

1. Compares current schema against the last snapshot in `meta/`
2. Generates a new SQL migration file in `migrations/`
3. Updates the snapshot in `meta/`

Example output: `migrations/0003_add_file_description.sql`

```sql
ALTER TABLE file_object ADD COLUMN description text;
```

### 3. Review migration

Always review the generated SQL before committing. Drizzle Kit generates correct SQL,
but human review catches unexpected changes or missing indexes.

### 4. Apply to local database

```bash
pnpm db:migrate:dev
```

This runs `scripts/migrate.ts` which reads all migrations and applies them to the local
SQLite database file (`apps/api/.db/local.sqlite`).

### 5. Commit

```bash
git add packages/shared/src/db/schema/ migrations/ meta/
git commit -m "chore(db): add file description column"
```

---

## Production Deployment

### Staging

```bash
# Merged to main → CI runs:
pnpm db:migrate:staging
# Which executes:
pnpm db:migrate:staging -- --remote
```

### Production

```bash
# Tag v* pushed → CI runs:
pnpm db:migrate:prod
# Which executes:
pnpm db:migrate:prod -- --remote
```

---

# Initial Setup (First Run)

On a fresh clone, set up the database:

```bash
# 1. Install dependencies
pnpm install

# 2. Create D1 databases (local + remote)
pnpm db:create:local    # Creates SQLite file
pnpm db:create:staging  # wrangler d1 create <staging database name>
pnpm db:create:prod     # wrangler d1 create <production database name>

# 3. Apply all migrations
pnpm db:migrate:dev

# 4. Seed development data
pnpm db:seed
```

---

# Seed Data

## Development Seeds (`seeds/dev.ts`)

```ts
import { db } from "../index"
import { workspace, user, fileObject } from "../schema"

export async function seedDev() {
  // Create default workspace
  const ws = await db.insert(workspace).values({
    id: "ws_dev_001",
    name: "Development Workspace",
    slug: "dev",
    ownerId: "user_dev_001",
    storageQuotaBytes: 10 * 1024 * 1024 * 1024, // 10 GB
  })

  // Create test user
  await db.insert(user).values({
    id: "user_dev_001",
    email: "dev@bucketdrive.local",
    name: "Dev User",
  })

  // Create sample folders and files
  // ...
}
```

## Production Seeds (`seeds/prod.ts`)

Production seeds run once per workspace creation:

```ts
export async function seedProd() {
  // Create system roles (owner, admin, editor, viewer)
  // Create default workspace settings
  // Set up initial workspace buckets
}
```

---

# D1 Limitations vs SQLite

D1 is SQLite-based but has specific limitations to be aware of:

| Feature                 | SQLite (dev)                   | D1 (prod)                        | Mitigation                                         |
| ----------------------- | ------------------------------ | -------------------------------- | -------------------------------------------------- |
| Foreign key enforcement | Yes (`PRAGMA foreign_keys=ON`) | **No**                           | Validate referential integrity in application code |
| Triggers                | Full support                   | Limited (not recommended for D1) | Use application-level logic or Workers             |
| ALTER TABLE             | Full support                   | Limited subset                   | Drizzle Kit generates D1-compatible ALTER          |
| Transaction size        | Unlimited                      | Max 5MB / 100 statements         | Batch large operations                             |
| Concurrent writes       | WAL mode                       | Single writer, queue reads       | Use `wrangler d1 execute` for batch ops            |
| Query timeout           | None                           | 10 seconds                       | Paginate large datasets                            |

## D1-Safe Practices

- Never rely on foreign key cascades — enforce in application layer
- Keep migrations small (one logical change per migration)
- Test migrations in staging before production
- Monitor D1 query latency in staging before promoting

---

# Rollback Procedure

If a migration breaks production:

1. **Do NOT delete or modify the migration file** — it already ran
2. Create a **fix migration** that reverses the problematic change
3. Deploy the fix migration normally

Example:

```bash
# Problem: 0003_add_file_description.sql added a NOT NULL column without a default
# Fix: create 0004_fix_file_description_default.sql

ALTER TABLE file_object
ALTER COLUMN description SET DEFAULT '';

UPDATE file_object SET description = '' WHERE description IS NULL;
```

---

# Commands Reference

```bash
# Generate migration from schema changes
pnpm db:generate

# Apply migrations to local SQLite
pnpm db:migrate:dev

# Apply migrations to staging D1
pnpm db:migrate:staging

# Apply migrations to production D1
pnpm db:migrate:prod

# Seed local database
pnpm db:seed

# Open Drizzle Studio (visual DB explorer)
pnpm db:studio

# Reset local database (delete and re-migrate)
pnpm db:reset
```

## Package.json scripts

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate:dev": "tsx scripts/migrate.ts",
    "db:migrate:staging": "wrangler d1 migrations apply <staging database name> --env staging",
    "db:migrate:prod": "wrangler d1 migrations apply <production database name> --env production",
    "db:seed": "tsx scripts/seed.ts",
    "db:studio": "drizzle-kit studio",
    "db:reset": "rm -f apps/api/.db/local.sqlite && pnpm db:migrate:dev && pnpm db:seed"
  }
}
```

---

# References

- [Drizzle Kit Documentation](https://orm.drizzle.team/docs/kit-overview)
- [Cloudflare D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 Limitations](https://developers.cloudflare.com/d1/platform/limits/)
- [ADR-003: Drizzle Kit + SQLite → D1](../architecture/../decisions/ADR-003-drizzle-d1-sqlite.md)
- [Data Model](../database/data-model.md)
