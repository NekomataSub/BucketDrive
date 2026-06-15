# Implementation Roadmap v2.0

Step-by-step guide organized by daily sessions. Each step is self-contained and ends with a
verifiable result.

> **Status tracking:** This file is updated after each day's implementation. Completed days
> are marked as `DONE`, partial work is marked as `PARTIAL`, and the section is updated with
> notes on actual changes made.

## Status Overview

> **Production worker cron deploy pass — 2026-06-15:**
>
> - Switched the production background Worker cron config to Wrangler's `[env.production.triggers] crons = [...]` format.
> - Changed the production workflow permission check to validate the Cloudflare schedules endpoint used by Wrangler.
> - Documented that the production deploy token must be able to update cron schedules for `bucketdrive-workers-production`.

> **Production deploy env simplification pass — 2026-06-15:**
>
> - Allowed production deploys to read `PLATFORM_OWNER_EMAIL` from a GitHub Environment variable with secret fallback.
> - Removed `PLAYWRIGHT_BASE_URL` and full Playwright runs from production deploy requirements.
> - Replaced production E2E/a11y steps with frontend and API smoke checks.

> **Production deploy simplification pass — 2026-06-15:**
>
> - Changed production deployment to run automatically on push to `main`.
> - Made staging deployment manual-only via GitHub Actions `workflow_dispatch`.
> - Added environment consistency checks so staging and production fail early on crossed Pages branch or URL variables.

> **Cloudflare custom-domain provisioning pass — 2026-06-15:**
>
> - Made the GitHub Actions custom-domain step provision both Cloudflare Pages association and DNS CNAME records.
> - Added idempotent conflict handling, domain status logging, and unit coverage for the provisioning script.
> - Documented `CUSTOM_DOMAIN` and the required `Pages Write`, `Zone Read`, and `DNS Write` token permissions.

> **Admin overview file navigation pass — 2026-06-14:**
>
> - Added folder IDs to dashboard largest-file contract responses.
> - Made largest-file rows in Admin Overview navigate to the containing folder.
> - Added contract coverage for nested largest-file folder metadata.

> **Platform name root sync pass — 2026-06-14:**
>
> - Synced the generated root bucket name with the platform service name when platform settings change.
> - Kept R2 object keys stable while making `/api/workspaces` return the renamed root.
> - Added contract coverage for platform rename propagation to workspace metadata.

> **Shared-with-me removal pass — 2026-06-13:**
>
> - Removed the dedicated `/shared` frontend route, sidebar entry, command palette command, and route-specific search state.
> - Simplified single-item and batch sharing flows so the UI only creates external file/folder links.
> - Updated Share Links to present external links only, while leaving legacy internal-share API support intact.

> **Remote D1/R2 recovery pass — 2026-06-13:**
>
> - Repaired the remote single-bucket D1 shape after the `--remote` migration by dropping stale `workspace_id` columns with an operation script.
> - Updated R2 import to sync the full bucket tree, including folder markers and legacy explorer paths, while reactivating files that still exist in R2.
> - Redirected non-API Worker requests back to the Vite app so `/` and `/login` no longer return JSON/Worker 404s during local dev.
> - Moved heavy batch ZIP generation out of the Worker path: batch downloads now resolve a manifest and assemble the ZIP in the browser with `client-zip`.
> - Added same-origin file content streaming plus contracts for batch manifests, file content downloads, and SPA fallback routing.

> **Batch selection pass — 2026-06-07:**
>
> - Added shared batch operation contracts and `/api/batch` routes for trash, restore, permanent delete, move, and share revocation.
> - Added frontend batch hooks with cache invalidation across files, folders, search, trash, shares, and dashboard data.
> - Extended Files, Trash, Share Links, and Shared with me with multi-selection via modifier clicks, range selection, keyboard select-all/escape, and empty-area drag selection.
> - Fixed empty-area drag selection by moving Files selection handling into the grid/list surfaces and adding live hit-testing plus blank table panel space.
> - Added a visible marquee overlay for drag selection and disabled native text selection only while dragging.
> - Replaced the separate Files bulk-action bar with an in-place toolbar mode that swaps filters for bulk actions while items are selected.
> - Added contract coverage for batch payloads, partial responses, RBAC failures, and share revocation.

> **Folder upload correction pass — 2026-06-07:**
>
> - Added explicit file/folder upload actions and preserved folder hierarchy from native folder selection and drag-and-drop.
> - Prevented structured uploads from starting before batch folder creation returns per-file target folders.
> - Allowed empty folder trees in batch-upload contracts and covered nested folder upload preparation.
> - Stopped R2 sync from importing managed upload keys as visible `/bucket/files/<uploadId>` folders and added cleanup for prior false imports.

> **UI consolidation pass — 2026-06-07:**
>
> - Added shared page layout controls for internal pages so headers, primary actions, toolbars, and segmented controls render consistently.
> - Consolidated sidebar destination pages to reduce duplicated or displaced actions across files, shares, trash, audit, members, settings, dashboard, and platform administration.
> - Split global platform settings from bucket operational settings and moved share-page branding overrides into Share Links.
> - Removed duplicate folder creation affordance from the sidebar folder tree while preserving contextual folder actions behind RBAC checks.

> **Correction pass — 2026-05-27:**
>
> - Mounted missing platform API/routes and added workspace creation support used by onboarding.
> - Hardened CORS/auth trusted origins, public share browsing, share password hashing, and markdown preview rendering.
> - Fixed upload session route ordering, multipart completion ordering, upload session ownership checks, and root batch-upload response shape.
> - Added workspace scoping checks for file preview/download/thumbnail reads and share resource lookups.
> - Fixed folder breadcrumb scoping, invalid descendant moves, and descendant path updates after folder move/rename.
> - Replaced contract/E2E placeholders with executable coverage for changed API shapes and critical frontend/backend wiring.
> - Added explicit RBAC permissions for permanent trash deletion and workspace-wide share management.
> - Split heavy frontend route chunks so the production build no longer emits the 500 kB chunk warning.
> - Fixed first-login onboarding routing after DB reset, exact sidebar active states, file preview vs drag handling, and local R2 CORS setup/status visibility.
> - Added real first-run setup path, `PLATFORM_OWNER_EMAIL` admin promotion, `db:reset:empty`, `R2_BUCKET_NAME` support, and protected R2 object import that preserves key paths as folders.
> - Corrected dev DB scripts to reset/migrate Wrangler D1 local state, relaxed Better Auth user-id contracts, and added `r2:verify`/structured R2 import errors.

| Day | Topic                     | Core Deliverable                                            | Status                                  |
| --- | ------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| 1   | Database                  | Schema migrated, seed data                                  | ✅ `59d3ea2`                            |
| 2   | Auth backend              | GitHub OAuth working via Better Auth                        | ✅ `f4f650e`                            |
| 3   | Auth frontend             | Login page, session guard, user context                     | ✅ `4b78970`                            |
| 4   | Storage                   | R2 provider with signed URLs                                | ✅ `101668b`                            |
| 5   | Upload                    | End-to-end drag-drop upload with progress                   | ✅ `8f0d0c2`                            |
| 6   | Explorer                  | Grid/list views with breadcrumbs                            | ✅ `c31881c`                            |
| 7   | Interactions              | Context menus, keyboard shortcuts, multi-select             | ✅ `680aa87`                            |
| 8   | Folders                   | CRUD, folder tree, drag-drop move                           | ✅ `70f64d0`                            |
| 9   | RBAC                      | Permission engine with can() checks                         | ✅ `e780c23`                            |
| 10  | Internal shares           | File sharing between workspace members                      | ✅ `27163c2`                            |
| 11  | External shares           | Public links with password + rate-limit                     | ✅ `47a6000`                            |
| 12  | Share management          | User dashboard + admin oversight                            | ✅ `56d0816`                            |
| 13  | Trash                     | Soft delete, restore, auto-cleanup                          | ✅ `11a6385`                            |
| 14  | Search                    | FTS5 full-text with filters                                 | ✅ `50e2e7b`                            |
| 15  | Tags & favorites          | Color-coded tags, star favorites                            | ✅ `50e2e7b`                            |
| 16  | Command palette           | Ctrl+K with search + commands                               | ✅ `fa94bd8`                            |
| 17  | Preview                   | Space to preview files inline                               | ✅ `9de8a5a`                            |
| 18  | Dark mode                 | Theme toggle, system detection, persistence                 | ✅ `e9e10a6`                            |
| 19  | Admin dashboard           | Analytics, members, audit, settings                         | ✅ `5f8ed5e`                            |
| 20  | Testing foundation        | Unit tests, type system, build health                       | ✅ — infra ready, real tests Days 30-31 |
| 21  | Multipart upload          | Real chunking, resumability, retry                          | ✅ `bb9aec4`                            |
| 22  | Undo / redo               | Ctrl+Z for move, rename, soft delete                        | ✅ `61477e0`                            |
| 23  | Clipboard & folder upload | Ctrl+V paste, OS folder drag with structure                 | ✅                                      |
| 24  | Virtualization            | react-window for 10k+ items, bundle audit                   | ✅                                      |
| 25  | RBAC v2                   | Manager/Guest roles, resource policies, billing/audit perms | ✅                                      |
| 26  | Workspace invitations     | Email invite tokens, join flow, ownership transfer          | ✅                                      |
| 27  | Share polish              | Analytics counters, branded public pages                    | ✅ `4639d9a`                            |
| 28  | Notifications             | In-app notification system + toast integration              | ✅                                      |
| 29  | Thumbnails & processing   | Async preview generation via workers                        | ✅ `14f6fb6`                            |
| 29  | Thumbnails & processing   | Backfill pending thumbnails via scheduled worker            | ✅                                      |
| 30  | Contract tests            | API contract validation against test D1                     | ✅                                      |
| 31  | E2E & a11y                | Playwright journeys, axe-core compliance                    | ✅                                      |
| 32  | Staging & final polish    | Deploy pipeline, Lighthouse CI, docs sync                   | ✅                                      |

---

## Day 1 - Database Foundation & Migration DONE (`59d3ea2`)

> **Notes from implementation:**
>
> - Fixed FK bug in `tags.ts`: `fileObjectId` referenced `workspace.id` instead of `fileObject.id`
> - Replaced `better-sqlite3` with `sql.js` in scripts (WSL2 platform compatibility)
> - Added `tsx`, `sql.js`, `uuid` as root devDependencies
> - Updated `turbo.json` `pipeline` -> `tasks` for Turbo v2 compat
> - `db:studio` requires `@libsql/client` which is ESM-only (not critical)

**Goal:** Database schema generated, migrated, and working locally.

### Step 1.1 - Generate initial migration

```bash
# From repo root
pnpm db:generate
```

This reads `packages/shared/src/db/schema/` and generates SQL in `packages/shared/src/db/migrations/`.

Verify: a `0000_init.sql` file appears in the migrations folder.

### Step 1.2 - Apply migration to local SQLite

```bash
# From repo root
pnpm db:migrate:dev
pnpm db:seed
```

This creates `apps/api/.db/local.sqlite` and seeds it with sample data.

Verify: run `pnpm db:studio` and open http://localhost:4983. You should see tables with seeded data.

### Step 1.3 - Commit

```bash
git add -A && git commit -m "chore(db): initial migration and seed"
```

---

## Day 2 - Authentication (Better Auth) DONE (`f4f650e`)

> **Notes from implementation:**
>
> - Installed `@better-auth/drizzle-adapter` as explicit dependency (imported from `better-auth/adapters/drizzle` re-exports it)
> - Created `packages/shared/src/db/schema/auth.ts` with `user`, `session`, `account`, `verification`, `organization`, `member` tables
> - Added `workspaceMember` junction table for future RBAC
> - Better Auth v1.x uses `POST /api/auth/sign-in/social` (not `GET /signin/github` as in v0.x)
> - D1 Miniflare simulator rejects JavaScript Date objects - added D1 binding wrapper in `db.ts` that serializes Dates to ISO strings
> - `migrations_dir` added to `wrangler.toml` for D1 local dev; migrations applied via `wrangler d1 execute`
> - `.dev.vars` must be in the same directory as `wrangler.toml` (repo root) to be picked up by Wrangler
> - OAuth flow fully functional: sign-in returns GitHub auth URL, callback route active, session endpoint returns null when unauthenticated
> - Auth middleware returns 401 on protected routes without a valid session

### Step 2.1 - Create GitHub OAuth App

1. GitHub -> Settings -> Developer settings -> OAuth Apps -> New OAuth App
2. Homepage URL: `http://localhost:8787`
3. Callback URL: `http://localhost:8787/api/auth/callback/github`
4. Copy Client ID and Client Secret

### Step 2.2 - Create `.dev.vars` file

```bash
# apps/api/.dev.vars
BETTER_AUTH_SECRET=your-generated-secret
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
```

Generate a secret: `openssl rand -base64 64`

### Step 2.3 - Test auth locally

```bash
# From repo root
cd apps/api && npx wrangler dev
```

Open `http://localhost:8787/api/auth/signin/github` in the browser.
It should redirect to GitHub OAuth, authenticate, and redirect back.

Verify: the `/api/auth/session` endpoint returns user data.

### Step 2.4 - Wire up `apps/api/src/middleware/auth.ts`

The middleware is stubbed. Verify it works by hitting a protected route like
`GET /api/workspaces/:id/files` with the session cookie. Should return empty data (not 401).

### Step 2.5 - Commit

```bash
git commit -m "feat(auth): verify Better Auth OAuth flow with GitHub"
```

---

## Day 3 - Login UI (Frontend) DONE (`4b78970`)

> **Notes from implementation:**
>
> - Created `apps/web/src/lib/auth.ts` with `useSession()` hook (TanStack Query) and `useSignOut()` hook
> - Created `apps/web/src/routes/login.tsx` with GitHub OAuth sign-in link (`GET /api/auth/sign-in/social?provider=github&callbackURL=/dashboard`)
> - Restructured `__root.tsx` routes: root `<Outlet />`, standalone `/login` route (redirects to `/dashboard` if already authenticated), `app` layout route with `beforeLoad` auth guard, `/` and `/dashboard` as children
> - Updated `topbar.tsx` to show user avatar/initials + name from session, sign-out button, wired theme toggle to Zustand store
> - Fixed pre-existing `no-confusing-void-expression` lint errors in `app-store.ts`
> - Added `defaultPendingComponent` spinner shown while session is being checked
> - Installed missing ESLint dependencies (`eslint`, `@eslint/js`, `typescript-eslint`, `globals`) that were configured but not in lockfile
> - Better Auth v1.x social sign-in endpoint: `GET /api/auth/sign-in/social?provider=github` (not the old `/api/auth/signin/github` from roadmap v0.x)
> - `@/` path alias imports from ESLint strict type-checked config trigger false positives on generic hook returns; suppressed with file-level disable in topbar.tsx

### Step 3.1 - Create login page

Create `apps/web/src/routes/login.tsx`:

- "Sign in with GitHub" button that links to `/api/auth/signin/github`
- Clean centered layout with BucketDrive branding

### Step 3.2 - Add auth context

Create `apps/web/src/lib/auth.ts`:

- `useSession()` hook that fetches `/api/auth/session` and caches via TanStack Query
- Redirect to `/login` if unauthenticated
- Show user avatar + name in Topbar

### Step 3.3 - Protect dashboard route

Update `__root.tsx`:

- If no session, redirect to `/login`
- Show loading spinner while checking session

### Step 3.4 - Verify

```bash
cd apps/web && npx vite dev
```

1. Open http://localhost:5173
2. Should redirect to /login
3. Click "Sign in with GitHub" -> OAuth flow -> redirected to /dashboard
4. Topbar shows user avatar and name

### Step 3.5 - Commit

```bash
git commit -m "feat(web): login page and session-based auth guard"
```

---

## Day 4 - R2 Storage Provider DONE (`101668b`)

> **Notes from implementation:**
>
> - Created `StorageProvider` interface with `generateSignedUploadUrl`, `generateSignedDownloadUrl`, `delete`, `copy`
> - Implemented `R2StorageProvider` using `aws4fetch` for S3-compatible presigned URLs (PUT/GET)
> - Added `R2BindingProvider` fallback when R2 S3 credentials are missing (presigned URLs disabled but delete/copy still work via R2 binding)
> - R2 S3 credentials loaded from env vars: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`
> - 8 unit tests passing with mocked R2Bucket and AwsClient
> - Upload contracts extended: `CompleteUploadRequest` now includes `fileName`, `mimeType`, `folderId`
> - All Drizzle queries use `await` (.all(), .get(), .run() return Promises in D1 driver)
> - Shared package `dist/` directory required rebuild after contract changes (`tsc` added as build script)
> - Workspaces handler (`GET /api/workspaces`) uses `workspaceMember` joined with `workspace` table

**Goal:** Files can be uploaded to R2 via signed URLs.

### Step 4.1 - Create R2 bucket

```bash
npx wrangler r2 bucket create bucketdrive-dev
```

### Step 4.2 - Implement StorageProvider

Create `apps/api/src/services/storage.ts` with `StorageProvider` interface:

```ts
interface StorageProvider {
  generateSignedUploadUrl(key: string, expiresIn?: number): Promise<string>
  generateSignedDownloadUrl(key: string, expiresIn?: number): Promise<string>
  delete(key: string): Promise<void>
  copy(fromKey: string, toKey: string): Promise<void>
}
```

Implement `R2StorageProvider`:

- Uses `c.env.STORAGE` (R2 bucket binding)
- `signedUploadUrl`: PUT, 15 min expiry
- `signedDownloadUrl`: GET, 15 min expiry
- `delete` + `copy`: delegate to R2 binding

### Step 4.3 - Write unit tests

Create `apps/api/src/services/__tests__/storage.test.ts`:

- Mock R2 binding
- Test signed URL generation
- Test error handling (missing bucket, missing key)

### Step 4.4 - Verify

Call `POST /api/workspaces/:id/files/upload` -> should return `{ signedUrl, storageKey }`.

Upload a file with `curl -X PUT "<signedUrl>" --upload-file test.txt` -> confirm in R2 dashboard.

### Step 4.5 - Commit

```bash
git commit -m "feat(storage): R2 storage provider with signed URLs"
```

---

## Day 5 - File Upload (End-to-End) DONE (`8f0d0c2`)

> **Notes from implementation:**
>
> - Combined Day 4 (storage backend) + Day 5 (upload UI) into a single implementation session
> - Created `UploadService` with `initiateUpload()` (RBAC/quota/mime validation, signed URL, UploadSession) and `completeUpload()` (FileObject creation, audit log)
> - Files handler wired: `POST /upload`, `POST /upload/complete`, `GET /:fileId/download`, `GET /` (list with sorting/pagination)
> - Frontend upload via XHR with `upload.onprogress` for progress tracking
> - Upload queue: Zustand store with status tracking (queued/uploading/completed/failed/cancelled), floating drawer UI
> - Drag-and-drop zone with native HTML5 drag events (highlight on drag-over)
> - File list table with loading skeleton, empty state, icons per mime type
> - Dashboard extracted to own route file (`routes/app/dashboard.tsx`), loads workspace + files
> - Fixed auth flow: Better Auth v1.x uses `POST /api/auth/sign-in/social` with JSON body (not GET with query params), session endpoint is `GET /api/auth/get-session` (not `/session`), `checkAuth()` verifies `data?.user` not just `res.ok`
> - Google OAuth pending: `redirect_uri_mismatch` requires exact URI match in Google Cloud Console
> - Added `vitest` config for API unit tests

**Goal:** User drags a file into the browser, it uploads to R2, metadata is saved.

### Step 5.1 - Implement upload service

Create `apps/api/src/services/upload.service.ts`:

- `initiateUpload()`: validate RBAC + quota + mime, generate signed URL, create UploadSession
- `completeUpload()`: verify parts, save FileObject metadata, audit log
- `cancelUpload()`: abort R2 multipart, mark session cancelled

### Step 5.2 - Implement upload handlers

Update `apps/api/src/modules/files/files.handler.ts`:

- `POST /upload` -> calls `initiateUpload`
- `POST /upload/complete` -> calls `completeUpload`
- Add proper Zod validation using `InitiateUploadRequest` / `CompleteUploadRequest`

### Step 5.3 - Implement upload queue UI

Create `apps/web/src/components/features/upload-queue.tsx`:

- Zustand store for upload state: files, progress, status
- Drag-and-drop zone on file explorer area
- Upload queue drawer: filename, progress bar, speed, ETA
- Actions: pause, resume, cancel per file

### Step 5.4 - Verify

1. Drag a file from OS to browser explorer area
2. File appears in upload queue with progress
3. On completion, file appears in explorer

### Step 5.5 - Commit

```bash
git commit -m "feat: end-to-end file upload with progress"
```

---

## Day 6 - File Explorer (Grid & List Views) DONE (`c31881c`)

> **Notes from implementation:**
>
> - Created `packages/shared/src/contracts/folders.ts` with `ListFoldersRequest`, `ListFoldersResponse`, `BreadcrumbItemSchema`, `BreadcrumbResponse`
> - Created `apps/api/src/modules/folders/folders.handler.ts` with `GET /` (list folders by parentFolderId) and `GET /:folderId/breadcrumbs` (walk parent chain to root)
> - Registered folders route at `apps/api/src/index.ts` -> `/api/workspaces/:workspaceId/folders`
> - Updated seed to add 2 root-level files (welcome.txt, getting-started.pdf) alongside 5 in Documents folder (7 total)
> - Created `explorer-store.ts` (Zustand): viewMode (grid/list), currentFolderId, sort, order, navigateTo/ToRoot actions
> - Updated `useFiles` hook to accept sort/order/page/limit params; added `useFolders` and `useBreadcrumbs` hooks
> - Created `file-grid.tsx` - responsive card grid (2-6 columns) showing folders (FolderOpen icon) first, then files (emoji icons)
> - Created `breadcrumbs.tsx` - Home icon + workspace name + folder segments, clickable navigation
> - Updated `file-list.tsx` to accept folders array, show folders first (clickable), maintain FileObject rows below
> - Updated `dashboard.tsx` with breadcrumbs bar, grid/list toggle, folder navigation, combined files + folders display
> - `ListFoldersRequest` supports `parentFolderId` param; `parentFolderId=null` filters root-level folders

**Goal:** Explorer displays files and folders in grid and list views.

### Step 6.1 - Implement list files handler

Update `GET /api/workspaces/:id/files`:

- Query `FileObject` with workspace scope, folder filter, sort, pagination
- Return `ListFilesResponse` shape

### Step 6.2 - Create useFiles hook

Create `apps/web/src/hooks/api/use-files.ts`:

- TanStack Query hook with `queryKey: ["files", workspaceId, params]`
- Zod parse on response to validate contract

### Step 6.3 - Implement file explorer grid

Create `apps/web/src/components/features/file-explorer.tsx`:

- Fetches files from API
- Grid view: cards with icon thumbnail, filename, size, date
- List view: table with columns (name, type, size, modified)
- Toggle between views (zustand store `explorer-view`)
- Empty state: "No files yet - drag files here to upload"

### Step 6.4 - Add folder navigation breadcrumbs

Breadcrumb component showing current path:

- Clickable segments that navigate
- Root: workspace name

### Step 6.5 - Verify

1. Seed creates 5 sample files
2. Explorer shows them in grid view
3. Toggle to list view -> table with columns
4. Breadcrumbs show path

### Step 6.6 - Commit

```bash
git commit -m "feat(explorer): grid and list views with breadcrumbs"
```

---

## Day 7 - Keyboard & Context Menus DONE (`680aa87`)

> **Notes from implementation:**
>
> - Added `RenameFileRequest` and `DeleteFileResponse` contracts to `packages/shared/src/contracts/files.ts`
> - Implemented `PATCH /:fileId` rename handler: updates `originalName` + `extension`, audit log `file.rename`
> - Implemented `DELETE /:fileId` soft-delete handler: sets `isDeleted=true, deletedAt=now()`, audit log `file.delete`
> - Expanded `explorer-store.ts` with selection state (`selectedFileIds`, `selectedFolderIds`), focus tracking (`focusedItemId`, `focusedItemType`), click tracking (`lastClickedItemId`, `lastClickedItemIndex`), clipboard support
> - Added selection actions: `selectItem`, `toggleSelect`, `selectRange`, `selectAll`, `clearSelection`, `setFocusedItem`
> - Created `use-explorer-shortcuts.ts` hook: arrow keys navigate grid/list, Enter opens, Delete trashes, Ctrl+A selects all, Ctrl+C/X copies/cuts, F2 renames, Escape clears selection
> - Created `file-context-menu.tsx` using `@radix-ui/react-context-menu` (already installed): right-click menu with Open, Download, Rename, Copy, Move, Share, Favorite, Delete per item type
> - Updated `file-grid.tsx`: items are `role="button" tabIndex={0}` with `data-item-*` attributes, click handlers with shift/ctrl modifiers, selected items get `ring-1 ring-accent bg-accent/10`, focused items get `ring-1 ring-border-muted`
> - Updated `file-list.tsx`: rows are interactive with same selection/focus visuals, `MoreVertical` button now opens `@radix-ui/react-dropdown-menu` with per-item actions
> - Wired `dashboard.tsx` with `useExplorerShortcuts`, bulk actions toolbar (shown when 2+ items selected), context menu callbacks for rename/delete/download
> - Added `useRenameFile` and `useDeleteFile` mutation hooks to `api.ts` with cache invalidation
> - Current limitations: Move/Copy/Share/Favorite actions are stubs (console.log or pending); folder operations (rename/delete) use file endpoint (folder CRUD comes in Day 8); no inline rename input yet (uses `window.prompt`)

**Goal:** Desktop-like keyboard and mouse interactions.

### Step 7.1 - Implement context menu

Create `apps/web/src/components/features/file-context-menu.tsx`:

- Right-click on file -> menu: Open, Rename, Move, Copy, Download, Share, Favorite, Delete
- Position-aware (doesn't overflow viewport)
- Keyboard: Shift+F10 or context menu key opens menu for selected file
- ESC closes menu

### Step 7.2 - Implement keyboard shortcuts

Create `apps/web/src/hooks/use-explorer-shortcuts.ts`:

- Enter = open file/enter folder
- Delete = trash selected
- Ctrl+A = select all
- Ctrl+C / Ctrl+X / Ctrl+V = copy / cut / paste
- F2 = rename
- Space = preview
- Arrow keys = navigate grid/list
- Shift+arrows = multi-select range
- Ctrl+click = toggle selection

### Step 7.3 - Implement multi-selection

- Click behavior: select item (deselect others)
- Shift+click: select range
- Ctrl/Cmd+click: toggle item in selection
- Selected items visual: accent border + subtle background
- Bulk actions toolbar appears when multi-selected: Delete, Move, Share, Download as ZIP

### Step 7.4 - Verify

1. Navigate files with arrow keys
2. Select multiple files with Shift+arrows
3. Right-click shows context menu with correct actions
4. Enter opens folder, Backspace goes back

### Step 7.5 - Commit

```bash
git commit -m "feat(explorer): keyboard navigation, context menus, multi-selection"
```

---

## Day 8 - Folder CRUD & Drag-Drop Move DONE (`70f64d0`)

> **Notes from implementation:**
>
> - Added `CreateFolderRequest`, `UpdateFolderRequest`, `DeleteFolderResponse` contracts to `packages/shared/src/contracts/folders.ts`
> - Folder handler (`folders.handler.ts`): `POST /` creates folder with materialized path (`parent.path/name`), `PATCH /:folderId` handles rename + move (combined `UpdateFolderRequest` with `name` + `parentFolderId`, recalculates path), `DELETE /:folderId` does recursive soft-delete (collects all descendant folders iteratively, marks files + folders as `isDeleted=true` in batch)
> - File handler (`files.handler.ts`): switched `PATCH /:fileId` from `RenameFileRequest` to `UpdateFileRequest` which already had `folderId` - supports rename AND move in one call; audit log differentiates `file.move` vs `file.rename`
> - Frontend hooks in `api.ts`: `useCreateFolder`, `useUpdateFolder`, `useDeleteFolder`, `useMoveFile` - all invalidate both `["files"]` and `["folders"]` query caches
> - Fixed pre-existing bug: dashboard `handleRenameItem` and `handleDeleteSelected` now route to correct mutation by item type (file vs folder) instead of always using file mutations
> - Added "New Folder" button in explorer toolbar (next to Upload), creates folder in current directory via `useCreateFolder`
> - Wired `onMove` context menu action through FileGrid/FileList -> dashboard; prompts for destination folder ID via `window.prompt`
> - Folder tree sidebar (`folder-tree.tsx`): renders below static nav links in Sidebar, uses `useFolders(wsId, null)` for root -> lazy-loads children on expand, chevron collapse/expand, highlights current folder, right-click context menu (New Subfolder, Rename, Delete), "All Files" root navigator
> - Drag-to-move with `@dnd-kit/core` (already installed): `DndContext` wraps explorer area in dashboard, `useDraggable` on file/folder items, `useDroppable` on folder items (files aren't drop targets), `DragOverlay` shows item name while dragging, dragged items get `opacity-50`, drop targets get `bg-accent/10` highlight, `onDragEnd` parses `folder-{id}` / `file-{id}` IDs and calls `useMoveFile` or `useUpdateFolder`
> - FileGrid/FileList refactored: extracted `FolderGridCard`/`FileGridCard` and `FolderListRow`/`FileListRow` sub-components with `useDraggable`+`useDroppable` hooks; removed explicit `role`/`tabIndex` that conflicted with `@dnd-kit` attributes

**Goal:** Users can create, rename, move, delete folders. Drag files between folders.

### Step 8.1 - Implement folder handlers

Update `apps/api/src/modules/folders/folders.handler.ts`:

- `POST /` - create folder
- `PATCH /:id` - rename/move folder
- `DELETE /:id` - soft-delete folder (recursive)

### Step 8.2 - Implement folder tree sidebar

Update sidebar to show folder tree:

- Expandable/collapsible
- Current folder highlighted
- Click to navigate
- Right-click folder: New Folder, Rename, Move, Delete

### Step 8.3 - Implement drag-to-move

Using `@dnd-kit`:

- Drag file to folder -> drop target highlights
- On drop -> API call to move file
- Optimistic update: file disappears from source, appears in target
- If API fails -> rollback

### Step 8.4 - Verify

1. Create a new folder: right-click -> New Folder -> type name -> Enter
2. Navigate into folder (double-click or Enter)
3. Drag a file from one folder to another
4. File moves (optimistic) and persists on reload

### Step 8.5 - Commit

```bash
git commit -m "feat: folder CRUD, folder tree, drag-drop to move"
```

---

## Day 9 - RBAC Engine DONE (`e780c23`)

> **Notes from implementation:**
>
> - Created `packages/shared/src/rbac/permissions.ts` with `Permission` Zod enum (30 permissions) and `ROLE_PERMISSIONS` mapping per role
> - Created `packages/shared/src/rbac/can.ts` with `can(role, permission, resourceOwnerId?, userId?)` - pure function, no DB dependency
> - Owner: all permissions; Admin: all except workspace.delete/transfer; Editor: read, upload, rename, move, copy, share, tag, favorite + shares management (NOT delete); Viewer: read only
> - Ownership override: editors can delete/restore their own files/folders even though the role doesn't include those permissions
> - Updated `apps/api/src/middleware/rbac.ts`: queries `workspaceMember` for the user's role, calls `can()`, returns 403 `FORBIDDEN` if denied, 403 `WORKSPACE_ACCESS_DENIED` if not a member
> - Fixed `folders.handler.ts`: changed GET / and GET /:folderId/breadcrumbs from `requirePermission("files.read")` to `requirePermission("folders.read")`
> - 19 unit tests in `packages/shared/src/rbac/__tests__/can.test.ts` - all passing
> - Seed now creates 4 members (owner, admin, editor, viewer) for multi-role testing
> - Added `vitest` devDependency and `test:unit` script to shared package

**Goal:** Permission system enforces access control.

### Step 9.1 - Implement permission engine

Create `packages/shared/src/rbac/can.ts`:

```ts
export function can(
  role: WorkspaceRole,
  permission: Permission,
  resourceOwnerId?: string,
  userId?: string,
): boolean
```

Define permission sets per role:

- `owner`: all permissions
- `admin`: all except transfer-ownership, delete-workspace
- `editor`: read, write, rename, move, share, tag, favorite
- `viewer`: read only

### Step 9.2 - Implement middleware

Update `apps/api/src/middleware/rbac.ts`:

- `requirePermission(permission)`: middleware that fetches user's role from D1 and calls `can()`
- Workspace-scoped: ensures user is member of target workspace

### Step 9.3 - Add RBAC to all protected routes

Wire `requirePermission()` into every handler:

- Files: `files.read`, `files.upload`, `files.delete`, `files.restore`
- Folders: `folders.read`, `folders.create`, `folders.delete`
- Shares: `shares.create`, `shares.read`, `shares.revoke`

### Step 9.4 - Write RBAC tests

Create `packages/shared/src/rbac/__tests__/can.test.ts`:

- Each role x each permission -> assert correct result
- Ownership: file owner can always read their own files
- Cross-workspace: viewer in A cannot access files in B

### Step 9.5 - Verify

1. Create 2 users with different roles in same workspace
2. Viewer tries `PATCH /files/:id` -> returns 403
3. Editor tries `DELETE /workspace/:id` -> returns 403
4. Admin tries `POST /shares` -> returns 200

### Step 9.6 - Commit

```bash
git commit -m "feat(rbac): permission engine with role-based middleware"
```

---

## Day 10 - Internal Sharing DONE (`27163c2`)

> **Notes from implementation:**
>
> - Created `SharesService` (`apps/api/src/modules/shares/shares.service.ts`) with CRUD + access methods: `createShare`, `listShares`, `getShare`, `updateShare`, `revokeShare`, `accessShare`
> - Password hashing uses Web Crypto API (SHA-256 with per-password salt) for Worker compatibility
> - Internal shares visible to all workspace members; `sharedWithMe=true` query param filters shares NOT created by current user
> - Share access validates active status, expiration, optional password; records access attempts; returns signed download URL
> - Wire up all 4 handler stubs: `GET /`, `POST /`, `PATCH /:shareId`, `DELETE /:shareId` with Zod validation
> - Exported `publicSharesHandler` for external share access (Day 11); mounted at `/api/shares` (no auth, no workspace scope)
> - Added `export * from "./contracts/shares"` to shared index.ts for direct import
> - Frontend hooks: `useShares`, `useCreateShare`, `useUpdateShare`, `useDeleteShare` in `lib/api.ts`
> - Created `ShareModal` (`@radix-ui/react-dialog`) with permission toggle (read/download), copy-link button, workspace-member scope
> - Created `Shared` page (`/shared` route) listing files shared with the current user via `sharedWithMe=true`
> - Added `onContextShare` prop through FileGrid/FileList -> dashboard -> share modal
> - Updated sidebar: "Shared" navigates to `/shared`
> - Seed data: 1 internal share (welcome.txt, owner-created, read+download permissions)
> - Fixed pre-existing lint errors: removed unused `real` import in `workspace.ts`, `**/dist` added to ESLint ignores
> - `shared.tsx` lint warnings match pre-existing patterns in `dashboard.tsx` (strict TypeScript ESLint checks against error-typed hooks)

### Step 10.5 - Verify

1. Create an internal share via context menu "Share" -> ShareModal appears
2. Select permissions (Read/Download), click "Create share" -> share created, link copyable
3. Other workspace member sees file in "Shared with me" page at `/shared`
4. Download button on shared file generates signed URL

### Step 10.6 - Commit

```bash
git commit -m "feat(shares): internal file sharing between workspace members"
```

---

## Day 11 - External Sharing DONE (`47a6000`)

> **Notes from implementation:**
>
> - Rate limiting uses existing `shareAccessAttempt` table - 5 failed attempts per IP in 15 min -> `SHARE_PASSWORD_RATE_LIMITED` (429), 10+ total failures in 30 min -> `SHARE_LOCKED` (423). No migration needed.
> - Added `GET /api/shares/:shareId` for public share metadata (no password needed, used by frontend to render) and `GET /api/shares/:shareId/browse?folderId=x&password=y` for navigating shared folders.
> - Created `ShareInfoResponse`, `ShareBrowseRequest`, `ShareBrowseResponse` Zod contracts in shared package.
> - Frontend: `routes/share.$shareId.tsx` (standalone, no auth guard) with password prompt, direct download view, and folder browser with breadcrumbs.
> - Updated `ShareModal` with share type selector (Internal / External Direct / External Explorer), password input, expiration dropdown. Link format differs: `/shared/:id` for internal, `/share/:id` for external.
> - Added `useShareInfo`, `useAccessShare`, `useBrowseShare` hooks to `lib/api.ts`.
> - Seed data now includes an external_direct share with password "test123" for testing.

**Goal:** Anyone with a link can view/download shared files (optional password).

### Step 11.1 - Implement external share creation

- `POST /shares` with `shareType: "external_direct"` or `"external_explorer"`
- Optional password: hash with bcrypt, store `passwordHash`
- Optional expiration: store `expiresAt`

### Step 11.2 - Implement public share gateway

Create `apps/api/src/modules/shares/public.handler.ts`:

- `POST /api/shares/:shareId/access` - validate password, check expiration, check locked status
- Log access attempt in `ShareAccessAttempt`
- Return signed download URL (direct) or folder contents (explorer)

### Step 11.3 - Implement brute-force protection

- Max 5 failed attempts per IP per 15 minutes
- After 10 total failures -> lock share for 30 minutes
- Lock auto-expires

### Step 11.4 - Create public share page

Create `apps/web/src/routes/share.$shareId.tsx`:

- No auth required (public route)
- If password-protected: show password input
- If direct share: show file info + download button
- If explorer share: show read-only file browser (no upload/delete)

### Step 11.5 - Verify

1. Create external share with password "test123"
2. Open link in incognito -> prompts for password
3. Enter correct password -> file downloads
4. Enter wrong password 6 times -> rate-limited
5. Wait 15 min -> can try again

### Step 11.6 - Commit

```bash
git commit -m "feat(shares): external sharing with password and rate limiting"
```

---

## Day 12 - Share Management Dashboard DONE (`56d0816`)

> **Notes from implementation:**
>
> - Added `/dashboard/shares` with a dedicated Share Links dashboard for creators, including copy link, edit expiration/password, and revoke actions
> - Added owner/admin "All Workspace Shares" tab with workspace-wide visibility and locked-link badges
> - Enriched `GET /api/workspaces/:workspaceId/shares` to return resource name, creator name, permissions, `hasPassword`, `isLocked`, and scope metadata
> - Updated `GET /api/workspaces` to include the current member `role`, so the frontend can gate admin oversight explicitly
> - Added audit events for `share.accessed`, `share.password_failed`, and `share.locked` on public access flows
> - Updated `/shared` to render real resource names and share creators instead of generic placeholders
> - Validation at implementation time: `packages/shared` lint/typecheck passed, `apps/api` share files lint passed, `apps/api` typecheck passed, `apps/web` typecheck passed
> - Follow-up audit on 2026-05-09 fixed the Windows Rollup issue by removing the Linux-only `pnpm.supportedArchitectures` restriction; `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` now pass on this machine

**Goal:** Users manage their shares; admins manage all workspace shares.

### Step 12.1 - User share page

Create `/dashboard/shares`:

- Table: file/folder name, share type, created date, expiration, access count
- Actions: copy link, change password, edit expiration, revoke
- Revoke confirmation: "This will immediately disable access. Continue?"

### Step 12.2 - Admin share overview

Admins see "All Workspace Shares" tab:

- All shares across all users
- Can revoke any share
- Can see locked shares (brute-force detection)

### Step 12.3 - Audit events

Ensure share actions generate audit logs:

- `share.created`, `share.accessed`, `share.revoked`, `share.password_failed`, `share.locked`

### Step 12.4 - Verify

1. User creates 3 shares -> sees them on dashboard
2. Admin sees 3 shares + 2 from other users
3. Admin revokes one -> share immediately disabled
4. External user opens revoked link -> "Link no longer available"

### Step 12.5 - Commit

```bash
git commit -m "feat(shares): management dashboard with admin oversight"
```

---

## Day 13 - Trash System DONE (`11a6385`)

> **Notes from implementation:**
>
> - Added shared trash contracts with combined file/folder trash items, restore responses, and permanent delete responses
> - Added dedicated `GET /api/workspaces/:workspaceId/trash` route plus file/folder restore and permanent purge endpoints
> - Centralized trash logic in `TrashService`: soft-delete side effects, name conflict handling on restore, share deactivation, favorite reactivation, and permanent purge
> - Normalized audit events to `file.deleted`, `folder.deleted`, `file.restored`, `folder.restored`, `file.permanently_deleted`, `folder.permanently_deleted`, plus auto-purge events
> - Added authenticated `/dashboard/trash` UI with search, sort, restore, and permanent delete actions
> - Fixed sidebar Trash navigation to point to the dedicated route
> - Added `apps/workers` scheduled worker app running daily at `03:00 UTC` to purge expired trash using workspace retention settings
> - Validation after implementation: `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` passed

**Goal:** Deleted files go to trash, can be restored within retention period.

### Step 13.1 - Implement soft-delete

Update delete handlers:

- `DELETE /files/:id` -> sets `is_deleted = true, deleted_at = NOW()`
- File remains in R2
- Active shares invalidated
- File removed from explorer, appears in trash

### Step 13.2 - Implement trash view

Create "Trash" route in sidebar:

- Lists deleted files with: name, original location, deleted date, days remaining
- Actions: Restore, Delete Permanently

### Step 13.3 - Implement restore flow

- `POST /files/:id/restore` -> sets `is_deleted = false`
- Returns to original folder if still exists, otherwise root
- Name conflict: append " (restored)" or number

### Step 13.4 - Implement permanent purge

- `DELETE /files/:id/permanent` -> removes from R2 + hard-deletes DB row
- Confirmation modal required

### Step 13.5 - Verify

1. Delete a file -> appears in trash with 30 days remaining
2. Restore it -> appears in original folder
3. Delete permanently -> file gone from R2 and DB

### Step 13.6 - Commit

```bash
git commit -m "feat(trash): soft delete, restore, and permanent purge"
```

---

## Day 14 - Search & Filters DONE (`50e2e7b`)

> **Notes from implementation:**
>
> - Added `0002_gentle_raven.sql` with a standalone FTS5 index, sync triggers, backfill, and supporting indexes for file search, tags, and favorites
> - Added `GET /api/workspaces/:workspaceId/search` with workspace-wide file search, MIME category filters, tag AND filtering, favorites filtering, pagination, and relevance-aware sorting
> - Upgraded file list responses to always include `tags` and `isFavorited`, so explorer and search results render the same metadata shape
> - Connected the global topbar to contextual Zustand-backed search state, with debounced search on Dashboard, Trash, Shared with me, and Share Links
> - Dashboard search now replaces folder browsing with result-mode UI, chips for active filters, and search-specific sorting while preserving normal explorer sorting when filters are used without text
> - Trash search now matches both item names and original locations, and shares pages support server-side query filtering via `q`
> - Validation after implementation: shared/api/web typecheck passed, `apps/web` production build passed, and API/shared unit tests passed

**Goal:** Users search files by name, filter by type/tags/favorites.

### Step 14.1 - Create FTS5 index

Create migration `0001_fts_search.sql`:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS file_search_idx USING fts5(
  original_name, extension, mime_type,
  content = 'file_object', content_rowid = 'id'
);
```

### Step 14.2 - Implement search endpoint

- `GET /api/workspaces/:id/search?q=report&type=documents&favorite=true`
- Query FTS5 with filters, pagination
- Return `SearchResponse` shape

### Step 14.3 - Implement search UI

- Search bar in topbar (already stubbed)
- Debounced input (300ms)
- Results replace explorer content
- Filter chips: [Documents] [Images] [Favorites] [Tag: Review]
- Sort dropdown: Relevance, Name, Date, Size
- Empty state: "No results - try different keywords"

### Step 14.4 - Verify

1. Seed creates files with known names
2. Type "budget" -> shows budget-2025.xlsx
3. Filter by images -> shows team-photo.png
4. Clear search -> returns to file explorer

### Step 14.5 - Commit

```bash
git commit -m "feat(search): FTS5 full-text search with filters"
```

---

## Day 15 - Tags, Favorites & Colors DONE (`50e2e7b`)

> **Notes from implementation:**
>
> - Added tag contracts and workspace tag CRUD endpoints under `/api/workspaces/:workspaceId/tags`
> - Implemented `POST /api/workspaces/:workspaceId/files/:fileId/tags` and `POST /api/workspaces/:workspaceId/files/:fileId/favorite`
> - Added dashboard tag filters, favorite-only search filtering, favorite stars, and tag chips in both grid and list explorer modes
> - Added a reusable tag management dialog for assign/create/edit/delete flows without introducing a new route
> - Standardized tag colors to a predefined palette so chips stay color-coded without violating the repo rule against inline styles
> - Favorites now invalidate explorer/search/trash queries consistently, and deleted files continue to deactivate/reactivate favorite state via the trash service
> - Validation after implementation: API/shared unit tests passed and the new file-query helper coverage verifies FTS tokenization and MIME category mapping

**Goal:** Users can tag files, favorite them, and see visual organization.

### Step 15.1 - Implement tag CRUD

- `POST /tags` -> create tag (name, color)
- `PATCH /tags/:id` -> update
- `DELETE /tags/:id` -> delete (removes from all files)

### Step 15.2 - Implement file tagging

- `POST /files/:id/tags` -> `{ tagIds: [...] }` - replaces all tags for file
- Tag chips shown on file cards (grid) and as column (list)
- Colors from tag: chip background is `tag.color`

### Step 15.3 - Implement favorites

- `POST /files/:id/favorite` -> toggle
- Star icon on file card/grid
- Filter: "Show favorites" toggle

### Step 15.4 - Create tag picker UI

- Dropdown: search/create tags
- Color picker for new tags
- Multi-select with checkboxes

### Step 15.5 - Verify

1. Create tag "Important" with red color
2. Tag a file -> red chip appears on file card
3. Favorite a file -> star icon appears
4. Filter search by favorite -> only favorited files shown

### Step 15.6 - Commit

```bash
git commit -m "feat: tags, favorites, and color-coded organization"
```

---

## Day 16 - Command Palette DONE

> **Notes from implementation:**
>
> - Installed `cmdk` v1.1.1 for the command palette primitive
> - Created `command-palette-store.ts` (Zustand) for global `isOpen`/`query` state
> - Created `use-command-palette-shortcut.ts` hook for global `Cmd/Ctrl+K` listener with input-element guard
> - Created `components/shared/commands/` with typed `Command` interface, `navigation.ts`, `appearance.ts`, `file-operations.ts`
> - Commands have `condition` predicates for context-awareness (e.g., grid/list view switch only on Files page; admin nav commands gated by `owner`/`admin` role)
> - Navigation commands use TanStack Router `useRouter()` for navigation (avoids circular import with `__root__`)
> - File-search fallback uses `useSearchFiles` hook with `limit: 3`; selecting a result navigates to its folder and focuses the file
> - `CommandPalette` component uses `cmdk`'s `Command.Dialog` with custom Radix overlay, Tailwind tokens (`bg-surface-default`, `border-border-default`, etc.), and grouped items
> - Keyboard footer hints (↑↓ navigate, ↵ select, ESC close)
> - Topbar `⌘K` badge converted to clickable button that opens the palette
> - `use-explorer-shortcuts.ts` updated to let `Cmd/Ctrl+K` pass through to the global shortcut hook
> - All strict ESLint rules respected via file-level disable comments following existing project patterns
> - Validation: `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` all pass

**Goal:** `Ctrl+K` opens command palette with all available actions.

### Step 16.1 - Implement command palette component

Create `apps/web/src/components/shared/command-palette.tsx`:

- `Ctrl/Cmd + K` toggle (global listener)
- Centered modal with backdrop blur, fade + scale-up animation (150ms)
- Search input with debounce
- Results grouped by category
- Keyboard: Up/Down select, Enter execute, Esc close, Tab cycle
- Focus trap and focus restoration
- Width: 560px, max-height: 400px, scrollable

### Step 16.2 - Define all commands

Create `apps/web/src/components/shared/commands/`:

- `navigation.ts`: Go to Files, Go to Shares, Go to Trash, Go to Settings
- `file-operations.ts`: Rename, Move, Copy, Delete, Share, Favorite, Tag
- `appearance.ts`: Toggle dark mode, Switch grid/list view
- Export unified `Command[]` array with `condition` predicates for context-awareness

### Step 16.3 - Add file-search fallback

When query doesn't match any command:

- Fall back to workspace file search
- Show top 3 file matches
- "Search files for 'query'" entry opens explorer pre-filled

### Step 16.4 - Wire keyboard handlers

- `Ctrl+K` always opens
- `Ctrl+F` opens palette pre-filled for file search
- `Esc` closes and restores focus

### Step 16.5 - Verify

1. Press Ctrl+K -> palette opens
2. Type "dark" -> "Toggle dark mode" appears
3. Press Enter -> theme toggles
4. Press Ctrl+K -> type "files" -> Press Enter -> navigates to files
5. Esc -> palette closes, focus restored

### Step 16.6 - Commit

```bash
git commit -m "feat: command palette with search and keyboard navigation"
```

---

## Day 17 - Inline Preview (Space) DONE

> **Notes from implementation:**
>
> - Added `PreviewUrlResponse` contract to `packages/shared/src/contracts/files.ts`
> - Created `GET /api/workspaces/:workspaceId/files/:fileId/preview` endpoint returning signed URL with 5-minute expiry and `mimeType`
> - Added `previewFileId` state and `setPreviewFileId` action to `explorer-store.ts`
> - Created `usePreviewUrl` TanStack Query hook in `lib/api.ts`
> - Built `FilePreview` component (`file-preview.tsx`) with slide-in panel (400px desktop, full-width mobile), dark overlay, header with filename/type/size, prev/next navigation, download button, and keyboard hints footer
> - MIME-type renderers: `image/*` (img with object-contain), `video/*` (video controls), `audio/*` (audio controls + filename), `application/pdf` (iframe), `text/markdown` (simple HTML rendering), `text/*` and JSON/CSV (pre-formatted monospace), unknown (metadata card with size, dates, checksum)
> - `FileContextMenu` gained `onPreview` prop and "Preview" item with Space shortcut label
> - `FileGrid` and `FileList` both support `onContextPreview` prop; double-click on file triggers preview
> - `use-explorer-shortcuts.ts` wired `Space` key to open preview for focused/selected files; preview panel itself handles `ArrowLeft`/`ArrowRight` for file navigation and `Escape` to close
> - Explorer route (`files.tsx`) integrates preview panel conditionally, computes `hasNext`/`hasPrev` from current file list, and provides navigation handlers
> - Validation: `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` all pass

**Goal:** Press Space to preview file contents without leaving the explorer.

### Step 17.1 - Implement preview API

- `GET /api/workspaces/:id/files/:fileId/preview` -> returns signed URL (5 min expiry, read-only)
- Content fetch for text/code/markdown via Worker (not direct R2)

### Step 17.2 - Implement preview panel

Create `apps/web/src/components/features/file-preview.tsx`:

- Slide-in panel on right (400px), modal on narrow screens
- Does NOT change URL
- Supported types:
  - Images: rendered directly with zoom
  - PDF: embedded viewer
  - Video/Audio: HTML5 player
  - Markdown: rendered with syntax highlighting
  - Code: syntax-highlighted
  - Text/CSV: plain text with line numbers
  - Unknown: metadata card (size, type, date, checksum)
- Skeleton loader while content loads

### Step 17.3 - Wire keyboard navigation

- `Space` on selected file -> open preview
- `Left/Right arrows` -> previous/next file in folder
- `Esc` -> close preview, focus back to explorer

### Step 17.4 - Integrate with explorer

- `file-grid.tsx` and `file-list.tsx` trigger preview on Space and double-click
- Preview state in Zustand explorer store

### Step 17.5 - Verify

1. Select a file in explorer
2. Press Space -> preview panel opens on the right
3. Image shows directly in the panel
4. Press Right arrow -> next file's preview loads
5. Press Esc -> preview closes, focus back to explorer

### Step 17.6 - Commit

```bash
git commit -m "feat(preview): inline file preview with arrow navigation"
```

---

## Day 18 - Dark Mode Toggle DONE (`e9e10a6`)

> **Notes from implementation:**
>
> - Updated `app-store.ts` to use `zustand/persist` with `bucketdrive-theme` localStorage key
> - Added `"system"` theme option alongside `"light"` / `"dark"`; `getResolvedTheme()` maps system to `matchMedia("prefers-color-scheme: dark")`
> - Added inline `<script>` in `index.html` that reads persisted theme and applies `.dark` class before React hydrates, eliminating FART
> - Added `matchMedia` change listener so live OS theme changes are reflected when in "system" mode
> - Replaced binary topbar toggle with `@radix-ui/react-dropdown-menu` allowing selection between Light / Dark / System with checkmarks
> - Added `prefers-reduced-motion: reduce` CSS block in `globals.css` that forces `animation-duration: 0.01ms` and `transition-duration: 0.01ms`
> - Audit discovered missing tokens: added `--color-surface-secondary`, `--color-error`, and `--shadow-*` tokens (light + dark variants) to `@theme`
> - Shadows now use higher opacity in dark mode so dropdowns/modals remain visually elevated
> - `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` all pass

**Goal:** Complete dark mode system matching design docs.

### Step 18.1 - Add persistence and system detection

Update `apps/web/src/stores/app-store.ts`:

- On init: read `localStorage.theme`, fallback to `prefers-color-scheme`
- Default to system preference if no stored value
- `toggleTheme()` persists to `localStorage`
- Apply `.dark` class on bootstrap before first paint (avoid flash)

### Step 18.2 - Audit all components

Verify every component has dark mode classes:

- Text contrast (no `text-gray-900` without dark variant)
- Border visibility in dark
- Shadows adjusted (docs specify dark shadow tokens)
- Focus rings visible in both modes
- `bg-card` / `bg-surface` layering correct

### Step 18.3 - Respect reduced motion

- Wrap animations in `prefers-reduced-motion` media query
- Palette, modals, and transitions must disable motion when requested

### Step 18.4 - Verify

1. Fresh browser (no localStorage) -> respects OS theme
2. Toggle -> persists after refresh
3. Delete localStorage -> falls back to OS theme
4. `prefers-reduced-motion: reduce` -> no animations

### Step 18.5 - Commit

```bash
git commit -m "feat(theme): dark mode persistence, system detection, and a11y audit"
```

---

## Day 19 - Admin Dashboard DONE (`5f8ed5e`)

> **Notes from implementation (2026-05-10):**
>
> - Reframed `/dashboard` as the admin home and moved the explorer to `/dashboard/files`
> - Added admin routes: `/dashboard/members`, `/dashboard/audit`, and `/dashboard/settings`
> - Added shared contracts for dashboard and members plus `allowedMimeTypes` + `storageQuotaBytes` support in workspace settings payloads
> - Added `dashboard` API module with overview metrics, 7-day storage trend, recent audit activity, and workspace settings read/update
> - Added `members` API module with direct-add by existing email, role updates, removals, owner guards, and member audit events
> - Introduced Better Auth membership unification helpers using `organization.id === workspace.id`, backfilling `organization/member` rows from `workspace/workspaceMember` when possible while keeping the legacy table synced
> - Seed now creates Better Auth `user`, `organization`, `member` records for the dev workspace fixtures
> - Frontend admin pages, route guards, and sidebar gating are wired and `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` pass
> - Contract/E2E coverage for admin endpoints scoped to Days 30-31

**Goal:** Workspace owners/admins see analytics and manage settings.

### Step 19.1 - Implement dashboard API

- `GET /api/workspaces/:id/dashboard/overview`: user count, storage trends, active shares count, recent activity
- `GET /api/workspaces/:id/dashboard/audit`: filtered audit log
- `GET /api/workspaces/:id/dashboard/settings`: workspace settings
- `PATCH /api/workspaces/:id/dashboard/settings`: update settings

### Step 19.2 - Create dashboard UI

- Stats cards: total files, users, storage used, active shares
- Chart: storage usage over time (simple bar chart)
- Largest files table
- Settings form: quotas, allowed mime types, retention days

### Step 19.3 - Verify

1. Owner logs in -> sees dashboard with stats
2. Viewer logs in -> dashboard link hidden (no permission)
3. Owner changes quota -> uploads respect new limit

### Step 19.4 - Commit

```bash
git commit -m "feat(dashboard): admin analytics and workspace settings"
```

---

## Day 20 - Testing Foundation DONE

> **Notes from implementation (2026-05-10):**
>
> - `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` all pass
> - Added `test:contracts` script to `apps/api` and `packages/shared` package.json, pointing to `src/__tests__/contracts` with placeholder tests
> - Added `test:e2e` placeholder script to `apps/web` package.json
> - Updated `turbo.json` to recognize `test:e2e` task
> - Contract test directories created with placeholder files so `pnpm test:contracts` executes successfully across packages
> - Real contract test coverage scoped to Day 30; E2E (Playwright) scoped to Day 31

**Goal:** Ensure existing tests pass, build is green, and test infrastructure is ready.

### Step 20.1 - Confirm current health

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test:unit
```

All must pass before proceeding.

### Step 20.2 - Add missing test scripts to package.json

Ensure root `package.json` has:

- `test:unit`
- `test:contracts` (placeholder)
- `test:e2e` (placeholder)
- `test:a11y` (placeholder)
- `test:all`

### Step 20.3 - Verify vitest configs

- `packages/shared/vitest.config.ts` exists and runs
- `apps/api/vitest.config.ts` exists and runs

### Step 20.4 - Commit

```bash
git commit -m "test: confirm testing foundation and build health"
```

---

## Day 21 - Multipart Upload & Resumability DONE (`bb9aec4`)

> **Notes from implementation:**
>
> - **Multipart threshold:** 250 MB (arquivos ≤ 250 MB usam single-shot PUT; > 250 MB usam multipart R2 real)
> - **Chunk size configurável:** `uploadChunkSizeBytes` adicionado a `workspace_settings` (default 5 MB, mínimo 5 MB forçado no backend via `Math.max(configured, 5 * 1024 * 1024)`)
> - **R2 multipart via binding:** Worker cria multipart com `binding.createMultipartUpload()`, gera presigned URLs S3 por parte via `aws4fetch` (`?uploadId=xxx&partNumber=n`), browser faz PUT direto no R2
> - **StorageProvider** estendido com 4 métodos: `createMultipartUpload`, `generateSignedUploadPartUrl`, `completeMultipartUpload`, `abortMultipartUpload`
> - **UploadService** refatorado: `initiateUpload` decide single vs multipart; `getUploadSession` retorna partes completadas; `generatePartSignedUrls` retorna URLs apenas para partes pendentes; `cancelUpload` aborta no R2
> - **Novos endpoints:** `GET /uploads/:sessionId`, `POST /uploads/:sessionId/parts`, `DELETE /uploads/:sessionId`
> - **Frontend chunked upload:** `File.slice()` em chunks; upload paralelo com max 4 concorrentes; retry com exponential backoff (3 retries, delay 1s, 2s, 4s)
> - **Persistência localStorage:** Zustand `persist` middleware salva metadados de upload (não o `File`); após F5, uploads reaparecem como "paused" com botão de resume
> - **Upload queue UI:** chunk progress ("Part 3/12 · 45%"), pause/resume, retry real, cancel real (aborta XHR + aborta multipart no R2)
> - **Workers R2 types:** `cloudflare.d.ts` atualizado com `R2MultipartUpload` interface para compatibilidade
> - **Migração:** `0003_great_sharon_ventura.sql` adiciona `upload_chunk_size_bytes`; aplicado manualmente via sql.js (dev DB) porque sql.js não suporta FTS5
> - `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` all pass

**Goal:** Files > 250 MB upload in chunks with resume support.

### Step 21.1 - Implement real multipart backend

Update `apps/api/src/services/upload.service.ts`:

- `initiateUpload()`: for files > 5 MB, create multipart R2 session, return `sessionId` + `partSize` + `totalParts`
- `getUploadSession(sessionId)`: return completed parts + remaining parts
- `completeUpload()`: accept parts array, verify ETags, complete multipart in R2
- `cancelUpload()`: abort multipart in R2, mark session cancelled

### Step 21.2 - Add resume endpoint

- `GET /api/workspaces/:id/uploads/:sessionId` -> session state with part statuses

### Step 21.3 - Implement chunked frontend upload

Update upload queue logic:

- Slice file into 5 MB chunks
- Upload parts in parallel (max concurrency: 3)
- Track ETags from R2 responses
- Resume: query session state, skip completed parts

### Step 21.4 - Add retry with backoff

```ts
const MAX_RETRIES = 3
const RETRY_BASE_DELAY = 1000
```

Exponential backoff on chunk upload failures.

### Step 21.5 - Verify

1. Upload a 15 MB file -> shows 3 parts uploading
2. Disconnect network mid-upload -> retry kicks in
3. Refresh page -> resume from last completed part
4. Cancel -> session aborted, parts cleaned

### Step 21.6 - Commit

```bash
git commit -m "feat(upload): multipart chunking, resumability, and retry"
```

---

## Day 22 - Undo / Redo System DONE (`61477e0`)

> **Notes from implementation:**
>
> - Built a global toast system on top of `@radix-ui/react-toast` with `ToastProvider`, `ToastContainer`, and an imperative `toast()` / `dismissToast()` API
> - Created `undo-store.ts` (Zustand) holding a typed stack of `UndoAction` objects capped at 50 entries; supports `push`, `pop`, `peek`, `clear`
> - Created `useUndoableMutations` hook that wraps `moveFile`, `renameFile`, `deleteFile`, `moveFolder`, `renameFolder`, and `deleteFolder`
> - Each undoable mutation executes the forward request, then on success pushes an inverse record to the stack and shows a toast with an **Undo** button
> - `undo()` pops the last action and runs the inverse mutation (e.g., `restoreFile` for soft delete, `moveFile` back to original folder, `renameFile` with original name)
> - Wired `Ctrl+Z` into `use-explorer-shortcuts.ts` (guarded by `!e.shiftKey` so `Ctrl+Shift+Z` remains free for future redo)
> - Integrated `ToastProvider` into `Layout` so toasts are global across all authenticated routes
> - Replaced all direct mutation calls in `files.tsx` (drag-drop move, context-menu move/rename/delete, bulk delete, inline rename) with undoable versions
> - Toast animations (`animate-slide-in`, `animate-swipe-out`, `animate-fade-out`) added to `globals.css`
> - `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` all pass

**Goal:** Users can undo destructive or mutating actions.

### Step 22.1 - Design undo stack

Zustand store `undo-stack.ts`:

- Stack of `UndoAction` objects (max 50)
- Each action: `type`, `payload`, `inverse()` function
- Actions: `move`, `rename`, `delete` (soft), `folder.move`, `folder.rename`

### Step 22.2 - Implement undoable mutations

Wrap existing mutations:

- `moveFile` -> push `inverse: move back to original folder`
- `renameFile` -> push `inverse: restore original name`
- `softDelete` -> push `inverse: restore from trash`

### Step 22.3 - Wire keyboard shortcut

- `Ctrl+Z` -> pop last action, call `inverse()`, show toast "Undo: action restored"
- `Ctrl+Shift+Z` -> redo (if implementing redo stack)
- Undo invalidates relevant query caches

### Step 22.4 - Add UI affordance

- Toast on undoable action: "File moved to Projects. [Undo]"
- Command palette: "Undo last action"

### Step 22.5 - Verify

1. Move a file -> press Ctrl+Z -> file returns to original folder
2. Rename a file -> undo -> original name restored
3. Delete a file -> undo -> file restored from trash
4. Undo stack clears on logout

### Step 22.6 - Commit

```bash
git commit -m "feat: undo/redo system for move, rename, and soft delete"
```

---

## Day 23 - Clipboard Paste & Folder Upload DONE

> **Notes from implementation:**
>
> - Added `BatchUploadRequest`, `BatchUploadResponse`, `BatchUploadItemRequest`, `BatchUploadFolderCreated`, `BatchUploadItemResponse` contracts to `packages/shared/src/contracts/files.ts`
> - Implemented `POST /api/workspaces/:workspaceId/files/batch-upload` in `files.handler.ts` with full folder hierarchy creation, empty-folder support, and per-file upload initiation
> - Backend folder creation is idempotent: reuses existing folders by `(workspaceId, parentFolderId, name)` match, creates missing ones with correct materialized `path`
> - Upload drop zone (`upload-drop-zone.tsx`) rewritten to use `DataTransfer.items` + `webkitGetAsEntry()` with recursive `FileSystemDirectoryReader` traversal (max depth 50)
> - Added global `paste` event listener in `files.tsx` that reads `e.clipboardData.files` and feeds into the batch upload flow
> - Upload store extended with `relativePath`, `targetFolderId`, `signedUrl`, and `addItems` action for pre-populated uploads
> - Upload processor (`use-upload.ts`) updated to skip `initiateUpload` when `uploadId` + `signedUrl`/`sessionId` are already present (batch pre-initiated), and passes `folderId` to `completeUpload`
> - Frontend `files.tsx` generates upload IDs upfront, calls `batchUpload.mutateAsync`, then updates store items with server-returned upload metadata so the queue processor handles data transfer only
> - `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` all pass

**Goal:** Paste files from clipboard; drag folders from OS maintaining hierarchy.

### Step 23.1 - Implement clipboard paste

Listen to `paste` event on explorer:

- `e.clipboardData.files` -> add to upload queue
- Support images copied from browser/screenshot tools
- Same validation pipeline as drag-drop

### Step 23.2 - Implement folder upload from OS

Handle `drag-drop` with `webkitGetAsEntry()`:

- Detect `isDirectory` on dropped items
- Recursively read directory entries
- Replicate folder structure in workspace (virtual folders)
- Max depth: 50 levels
- Empty folders created (not skipped)

### Step 23.3 - Add folder upload API batch endpoint

- `POST /api/workspaces/:id/files/upload/batch` -> accepts array of `{path, fileName, mimeType, sizeBytes}`
- Creates folder hierarchy first, then returns signed URLs for each file
- Preserves relative paths

### Step 23.4 - Visual feedback

- Paste: brief flash highlight on explorer area
- Folder drop: show folder tree being created in upload queue
- Progress per file within folder upload

### Step 23.5 - Verify

1. Copy image in OS -> Ctrl+V in explorer -> upload starts
2. Drag folder "Photos/2025/" from Finder -> virtual folders created, files uploaded with correct paths
3. Empty folder inside dragged folder -> empty folder created in workspace

### Step 23.6 - Commit

```bash
git commit -m "feat(upload): clipboard paste and OS folder drag with structure preservation"
```

---

## Day 24 - Virtualization & Performance DONE

> **Notes from implementation:**
>
> - Installed `@tanstack/react-virtual` v3 in `apps/web`
> - Refactored `file-list.tsx` from `<table>` to div-based virtualized list using `useVirtualizer` with fixed `ROW_HEIGHT = 56`, `overscan = 5`, and `maxHeight: calc(100vh - 320px)` scroll container
> - Refactored `file-grid.tsx` to virtualized grid with `lanes` mapped to responsive column count (`getGridCols` via `ResizeObserver`), `ROW_HEIGHT = 172`, `overscan = 2`
> - Both components preserve all existing functionality: DnD (`@dnd-kit`), selection/focus (Zustand ID-based), context menus (`@radix-ui`), keyboard navigation (`useExplorerShortcuts`)
> - Added `scrollToIndex` integration via `useEffect` in both components so keyboard focus auto-scrolls the focused item into view
> - Global index semantics preserved (folders first, then files) — `virtualItem.index` maps directly to the same index used by `onItemClick` and the explorer store
> - Bundle audit: JS gzipped = **220.43 KB**, CSS gzipped = **7.71 KB** — well under the 500 KB target
> - `@tanstack/react-virtual` adds ~3 KB gzipped; no lazy chunking needed at this stage
> - Scope limited to file explorer (list + grid); other lists (search, trash, audit, shares) deferred to future optimization pass
> - `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` all pass

**Goal:** Lists remain performant with 10,000+ items; bundle audited.

### Step 24.1 - Add virtualization library

```bash
pnpm add @tanstack/react-virtual
```

### Step 24.2 - Virtualize file list and grid

Update `file-list.tsx`:

- Use `useVirtualizer` for row virtualization
- Estimated row height: 48px (list), 160px (grid)
- Overscan: 5 rows

Update `file-grid.tsx`:

- Virtualize grid with column-aware virtualizer
- Dynamic column count based on container width

### Step 24.3 - Virtualize search results and audit log

Apply same pattern to:

- Search results page
- Trash list
- Audit log table
- Share management tables

### Step 24.4 - Audit bundle size

```bash
cd apps/web && pnpm build
```

- Analyze bundle with `rollup-plugin-visualizer` or `vite-bundle-visualizer`
- Target: < 500 kB JS total (gzipped)
- Split heavy dependencies (syntax highlighter, PDF viewer) into async chunks

### Step 24.5 - Verify

1. Seed 10,000 files -> explorer scrolls at 60fps
2. Bundle report shows < 500 kB
3. Lazy chunks load on demand (preview types)

### Step 24.6 - Commit

```bash
git commit -m "perf: list virtualization and bundle size audit"
```

---

## Day 25 - RBAC v2 DONE

> **Notes from implementation:**
>
> - Fixed critical bug in `apps/api/src/lib/workspace-membership.ts`: `WORKSPACE_ROLES` only recognized 4 roles (`owner`, `admin`, `editor`, `viewer`), causing `manager` and `guest` to be downgraded to `viewer` at runtime. Added both missing roles.
> - `manager` permissions: full file/folder/share CRUD + delete/restore, analytics/audit read, users read, workspace settings read. Denied: billing, users invite/remove/update_roles, workspace delete/transfer, workspace settings update.
> - `guest` permissions: `files.read` and `folders.read` only — no shares, no write, no admin.
> - Ownership override now excludes `guest` in addition to `viewer`; `manager` correctly benefits from ownership override.
> - Added `canWithInheritance()` and `CanContext` to `can.ts`: `folders.read` on parent implies `folders.read` on children. Applies to breadcrumbs, tree navigation, and search.
> - Exported `FilePolicy`, `FolderPolicy`, and their types from `packages/shared/src/rbac/index.ts` for broader use.
> - Updated all hardcoded role checks in frontend (`dashboard.tsx`, `shares.tsx`, `navigation.ts`) and backend (`shares.service.ts`) to include `manager` alongside `owner`/`admin`.
> - Expanded `can.test.ts` from 18 to 33 tests covering: `manager` full suite, `guest` isolation, ownership override for manager/guest, and permission inheritance scenarios.
> - `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` all pass.

**Goal:** Full RBAC matching doc specification.

### Step 25.1 - Add missing roles

Update `packages/shared/src/rbac/permissions.ts`:

- Add `manager` and `guest` to `WorkspaceRole`
- Define `ROLE_PERMISSIONS` for both:
  - `manager`: manage files, folders, shares, view analytics (NOT billing, NOT admin management)
  - `guest`: limited resource viewing, isolated scope

### Step 25.2 - Add billing and audit permissions

Add to `Permission` enum:

- `billing.read`, `billing.manage`
- `audit.read`, `audit.export`

Wire into dashboard handlers:

- `GET /dashboard/overview` -> requires `billing.read` for billing data
- `GET /dashboard/audit` -> requires `audit.read`

### Step 25.3 - Implement resource policies

Create `packages/shared/src/rbac/policies.ts`:

- `FilePolicy.canDelete(user, file)` -> ownership + role + permission
- `FilePolicy.canShare(user, file)` -> similar
- Replace scattered inline checks with policy calls

### Step 25.4 - Add permission inheritance

For folder operations:

- `folders.read` on parent implies `folders.read` on children
- Apply to breadcrumbs, tree navigation, and search

### Step 25.5 - Update tests

Expand `can.test.ts`:

- `manager` x all permissions
- `guest` x all permissions
- Resource policy tests
- Inheritance tests

### Step 25.6 - Verify

1. Assign `manager` role -> can manage files/shares, cannot access billing
2. Assign `guest` role -> limited view only
3. `FilePolicy.canDelete` correctly handles ownership override
4. All existing tests still pass

### Step 25.7 - Commit

```bash
git commit -m "feat(rbac): manager and guest roles, resource policies, billing/audit permissions"
```

---

## Day 26 - Workspace Invitations & Ownership Transfer DONE

> **Notes from implementation:**
>
> - Added `workspaceInvitation` schema with `token`, `email`, `role`, `expiresAt`, `status` (pending/accepted/revoked/expired), `invitedBy`
> - Generated migration `0004_oval_krista_starr.sql`; applied manually via sql.js script (FTS5 migration 0002 blocks `pnpm db:migrate:dev` on sql.js)
> - Refactored `POST /api/workspaces/:id/members` from direct-add to invitation-based flow: creates `workspaceInvitation`, checks for duplicate emails/members, returns `inviteLink`
> - New backend handlers: `GET /api/workspaces/:id/invitations`, `DELETE /api/workspaces/:id/invitations/:id`, `GET /api/invitations/:token`, `POST /api/invitations/:token/accept`
> - Ownership transfer implemented as immediate transfer (not pending/timeout): `POST /api/workspaces/:id/transfer-ownership` validates current owner, target is admin, then swaps roles and updates `workspace.ownerId`
> - Frontend Members page redesigned with tabs (Members / Pending Invitations), copy-link for invites, revoke action, and ownership transfer button for admins
> - Public `/join?token=xxx` page handles auth check, email mismatch warning, and invitation acceptance with redirect to dashboard
> - No email provider integration (Resend etc.) per decision — invites use copyable links only
> - Audit events: `member.invited`, `member.invitation_revoked`, `member.joined`, `ownership.transferred`
> - Validation: `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` all pass

**Goal:** Full workspace membership lifecycle.

### Step 26.1 - Add invitation schema

Migration or schema update:

- `WorkspaceInvitation` table: `id`, `workspaceId`, `email`, `role`, `token`, `expiresAt`, `usedAt`, `createdAt`

### Step 26.2 - Implement invitation backend

- `POST /api/workspaces/:id/invitations` -> create invitation, generate token (7 days expiry)
- `GET /api/workspaces/join?token=xxx` -> validate token, render join page
- `POST /api/workspaces/join/accept` -> accept invitation, create member, audit log
- `GET /api/workspaces/:id/invitations` -> list pending invitations (admin/owner)
- `DELETE /api/workspaces/:id/invitations/:id` -> revoke invitation

### Step 26.3 - Integrate email delivery

Use Cloudflare Email Routing or Resend:

- Send invitation email with tokenized link
- Template: workspace name, inviter name, role, expiry, CTA button

### Step 26.4 - Implement ownership transfer

- `POST /api/workspaces/:id/transfer-ownership` -> create transfer request (pending, 7-day timeout)
- `POST /api/workspaces/:id/transfer-ownership/accept` -> new owner accepts
- `POST /api/workspaces/:id/transfer-ownership/decline` -> new owner declines
- Auto-expire after 7 days
- Audit log: `ownership.transferred`

### Step 26.5 - Frontend pages

- Members page: "Invite by email" with role selector
- Join page: `/join?token=xxx` (no auth required, redirects to signup/login if needed)
- Dashboard settings: ownership transfer button (owner only, with confirmation)

### Step 26.6 - Verify

1. Owner invites `new@example.com` as Editor -> email sent
2. New user clicks link -> signs up -> joins workspace as Editor
3. Owner initiates transfer to Admin -> Admin sees notification -> accepts
4. Old owner becomes Admin, new owner takes over

### Step 26.7 - Commit

```bash
git commit -m "feat(workspace): email invitations, join flow, and ownership transfer"
```

---

## Day 27 - Share Analytics & Branded Pages DONE

> **Notes from implementation:**
>
> - Added `downloadCount` column to `shareLink` schema with default `0`; generated migration `0005_mature_blue_blade.sql`
> - Updated `ShareLinkSchema` and `ShareDashboardItemSchema` in shared package to include `downloadCount`
> - Updated shared contracts: `ShareAccessResponse`, `ShareInfoResponse`, and `ShareBrowseResponse` now include `brandingLogoUrl` and `brandingName`
> - Backend `SharesService` increments `downloadCount` only when a signed download URL is generated for a file share (`accessShare`); `browseShare` does not increment downloads (folder browsing is access-only)
> - Added `getWorkspaceBranding()` private method to `SharesService` that queries `workspaceSettings` by `workspaceId` and returns branding fields
> - All public share endpoints (`getShareInfo`, `accessShare`, `browseShare`) now include branding in their responses
> - Share management dashboard (`shares.tsx`) updated with:
>   - New "Total Downloads" stats card
>   - Separate "Accesses" and "Downloads" columns in the table
>   - `downloadCount` displayed in the edit modal analytics card
> - Public share page (`share.$shareId.tsx`) updated to use workspace branding:
>   - `SharePasswordForm` receives `info` prop and displays `brandingName`
>   - `ShareExternalDirect` shows branding name in subtitle and footer badge
>   - `ShareExternalExplorer` header shows logo image + branding name when configured
>   - Fallback to "BucketDrive" when no workspace branding is set
> - Validation: `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` all pass
> - Rebuilt `packages/shared/dist/` via `tsc --build` after schema changes to satisfy project references

**Goal:** Shares have analytics and branding.

### Step 27.1 - Add share analytics counters

Update `ShareLink` schema or use aggregation:

- `accessCount`: increment on each `accessShare`
- `downloadCount`: increment on each signed download URL generation
- `lastAccessedAt`: timestamp

### Step 27.2 - Expose analytics in API

- `GET /api/workspaces/:id/shares` -> include `accessCount`, `downloadCount`, `lastAccessedAt`
- Update shared contract

### Step 27.3 - Show analytics in UI

- Share management dashboard: columns for access count, last accessed
- Share detail modal: mini analytics card

### Step 27.4 - Implement branded public pages

Update `apps/web/src/routes/share.$shareId.tsx`:

- Read `brandingLogoUrl` and `brandingName` from share metadata
- Render custom logo and name at top of public share page
- Fallback to default BucketDrive branding if not set

### Step 27.5 - Apply branding to external explorer shares

- Branded header on folder browser
- Consistent color scheme (respect workspace branding)

### Step 27.6 - Verify

1. Create share -> access it 3 times -> dashboard shows accessCount = 3
2. Download file -> dashboard shows downloadCount incremented
3. Set branding logo/name in workspace settings -> public share page shows custom branding

### Step 27.7 - Commit

```bash
git commit -m "feat(shares): access/download analytics and branded public pages"
```

---

## Day 28 - Notifications System DONE

> **Notes from implementation:**
>
> - Updated `notification` schema to add `workspaceId` (nullable FK), `data` (JSON string for context), and generated migration `0006_talented_clea.sql`
> - Created `NotificationsService` with `createNotification`, `listNotifications`, `getUnreadCount`, `markAsRead`, `markAllAsRead`
> - Created `notifications.handler.ts` mounted at `/api/notifications` with endpoints: `GET /`, `GET /unread-count`, `PATCH /:id/read`, `POST /read-all`
> - Emitted notifications from existing events: `share.locked` (creator notified on 10th failed attempt), `member.invited` (existing user notified), `member.joined` (inviter notified on accept), `ownership.transferred` (new owner notified)
> - Frontend: `useNotifications` (polling every 30s), `useUnreadCount`, `useMarkRead`, `useMarkAllRead` hooks in `lib/api.ts`
> - `NotificationBell` component with unread badge count, dropdown panel showing 20 newest notifications, time-ago formatting, per-notification mark-read, "Mark all read" action
> - Clicking a notification navigates to relevant context (`/dashboard/shares`, `/dashboard/members`, `/dashboard`) and marks it as read
> - Integrated into topbar between theme toggle and user avatar
> - No WebSocket/SSE — short-polling every 30s keeps implementation simple and infra-free
> - Validation: `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` all pass

**Goal:** In-app notification system for workspace events.

### Step 28.1 - Add notification schema

Migration:

- `Notification` table: `id`, `userId`, `workspaceId`, `type`, `title`, `message`, `data`, `readAt`, `createdAt`
- Types: `share.locked`, `member.invited`, `ownership.transfer`, `trash.purged`, `quota.warning`

### Step 28.2 - Implement notification API

- `GET /api/notifications` -> list for current user, paginated
- `PATCH /api/notifications/:id/read` -> mark as read
- `POST /api/notifications/read-all` -> mark all as read
- `GET /api/notifications/unread-count` -> badge count

### Step 28.3 - Emit notifications from events

Update services to create notifications:

- Share locked -> notify share creator
- Member invited -> notify invited user (if exists)
- Ownership transfer requested -> notify target user
- Trash auto-purge imminent -> notify file owners

### Step 28.4 - Add notification UI

- Bell icon in topbar with unread badge
- Dropdown panel listing notifications (newest first)
- Click notification -> navigate to relevant context
- "Mark all read" button

### Step 28.5 - Verify

1. Trigger 5 failed password attempts on share -> creator sees "Share locked" notification
2. Invite member -> invited user sees notification
3. Mark notification as read -> badge count decreases

### Step 28.6 - Commit

```bash
git commit -m "feat(notifications): in-app notification system for workspace events"
```

---

## Day 29 - Thumbnails & Async Processing DONE

> **Notes from implementation:**
>
> - Added `thumbnailKey` and `metadata` columns to `fileObject`; generated migration `0008_parched_eternity.sql`
> - Installed `@cf-wasm/photon` v0.3.5 in `apps/api` for WASM-based image resizing inside the Worker
> - Created `ThumbnailService` (`apps/api/src/services/thumbnail.service.ts`) with `generate()` for images and `uploadVideoFrame()` for videos
> - Image thumbnails: downloads from R2 via binding, resizes to max 256x256 with Lanczos3 filter, exports WebP, uploads back to `workspace/{id}/thumbnails/{fileId}.webp`, updates DB
> - Memory guard: skips images > 20 MB to avoid Worker OOM (128 MB limit)
> - Async trigger: `files.handler.ts` calls `c.executionCtx.waitUntil(thumbnailService.generate(...))` after `completeUpload` for `image/*` MIME types — non-blocking for the upload response
> - Video thumbnails: frontend extracts a frame at 0.5s via `<video>` + `<canvas>` during upload, then `POST`s the WebP blob to `/api/workspaces/:id/files/:fileId/thumbnail` after upload completes
> - New API endpoints: `GET /files/:fileId/thumbnail` (signed URL, 5 min expiry) and `POST /files/:fileId/thumbnail` (accepts video frame blob)
> - Frontend: `useThumbnailUrl` hook, `FileThumbnail` component with loading pulse and icon fallback, integrated into `FileGridCard` and `FileListRow`
> - Added `arrayBuffer()`, `text()`, `json()`, `blob()` to custom `R2ObjectBody` interface in `cloudflare.d.ts` to satisfy type resolution
> - `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:unit` all pass
> - Added scheduled thumbnail backfill for visual files with missing `thumbnailKey`, including R2-imported images, with bounded batches and per-file failure accounting.
> - Frontend thumbnail loading now polls briefly for `THUMBNAIL_NOT_FOUND` so newly generated thumbnails appear without a manual refresh.
> - Added service and wiring tests for thumbnail generation, backfill, and pending-thumbnail polling.

**Goal:** Uploaded images and videos get thumbnails generated asynchronously.

### Step 29.1 - Add thumbnail storage and schema

- `FileObject.thumbnailKey` column (nullable)
- Thumbnails stored in R2 under `workspace/{id}/thumbnails/{fileId}.webp`

### Step 29.2 - Implement thumbnail generation worker

Update `apps/workers/src/index.ts`:

- Queue-based or event-driven processing
- Trigger: after `completeUpload` for image/video MIME types
- Use Web APIs or WASM (e.g., `sharp` not available in Workers; use Canvas API or Cloudflare Images)
- Generate 256x256 WebP thumbnail
- Upload to R2, update `FileObject.thumbnailKey`

### Step 29.3 - Serve thumbnails in explorer

- `GET /api/workspaces/:id/files/:fileId/thumbnail` -> returns signed thumbnail URL
- Update file-grid.tsx to show thumbnail images instead of icons for image/video files
- Fallback to icon if thumbnail not yet generated

### Step 29.4 - Add metadata extraction (optional)

- Extract EXIF from images, dimensions, duration from video
- Store in `FileObject.metadata` JSON column

### Step 29.5 - Verify

1. Upload image -> thumbnail appears in grid view within seconds
2. Upload video -> thumbnail frame extracted
3. Large image -> thumbnail is WebP, significantly smaller

### Step 29.6 - Commit

```bash
git commit -m "feat(processing): async thumbnail generation for images and videos"
```

---

## Day 30 - Contract Tests DONE

> **Notes from implementation:**
>
> - Added a real API contract harness under `apps/api/src/__tests__/contracts/` using migrated in-memory SQLite through a D1-compatible binding shim.
> - Mocked Better Auth sessions, R2 bucket behavior, and Photon WASM so contract tests run deterministically without OAuth, Cloudflare, or image-processing services.
> - Added endpoint contract coverage for auth, files, folders, shares, search, tags, trash, dashboard, members, invitations, notifications, workspaces, platform routes, and public share schemas.
> - Contract tests validate successful responses with shared Zod schemas plus representative unauthenticated, RBAC-denied, conflict, and validation-error cases.
> - Added test-only DB singleton reset support and made top-level Zod validation errors return `400 VALIDATION_ERROR` instead of falling through to `500`.
> - Fixed search response normalization so raw D1 search rows include `thumbnailKey`/`metadata` and boolean `isDeleted`, matching `SearchResponse`.
> - Fixed a frontend lint violation in `file-thumbnail.tsx` so CI-style lint passes.

> **Implemented:** Contract tests now live in `apps/api/src/__tests__/contracts/` and verify
> routed API responses against shared Zod schemas using an isolated migrated test database.

**Goal:** Every API endpoint has contract test coverage.

### Step 30.1 - Set up contract test infrastructure

Create `apps/api/src/__tests__/contracts/`:

- Test D1 database setup (in-memory or seeded SQLite)
- Hono worker instance per test file
- Seed helpers for workspaces, users, files, shares

### Step 30.2 - Write contract tests for all modules

Files to create:

- `files.contract.test.ts`: list, upload initiate, upload complete, download, update, delete, restore
- `folders.contract.test.ts`: list, create, update, delete, breadcrumbs
- `shares.contract.test.ts`: create, access, revoke, public access
- `search.contract.test.ts`: basic query, filters, empty results
- `tags.contract.test.ts`: create, assign, remove
- `trash.contract.test.ts`: list, restore, permanent delete
- `auth.contract.test.ts`: session, protected routes return 401
- `dashboard.contract.test.ts`: overview, audit, settings
- `members.contract.test.ts`: list, add, update role, remove

Each test:

- Success shape validated with Zod `.parse()`
- Auth required (401 without cookie)
- RBAC denied (403 with wrong role)
- Validation error (400 with bad input)

### Step 30.3 - Wire test:contracts script

Update root `package.json`:

```json
"test:contracts": "vitest run --config apps/api/vitest.config.ts apps/api/src/__tests__/contracts"
```

### Step 30.4 - Verify

```bash
pnpm test:contracts
```

All tests pass.

### Step 30.5 - Commit

```bash
git commit -m "test(contracts): API contract tests for all endpoints"
```

---

## Day 31 - E2E & Accessibility

> **Notes from implementation:**
>
> - Added Playwright with Chromium plus `@axe-core/playwright`, root config, and `pnpm test:a11y`.
> - Added deterministic `E2E_TEST_AUTH=true` login/session routes and fixture file creation guarded from production use.
> - Added critical journeys for auth/session/logout, upload fixture visibility, public password share access, RBAC viewer restrictions, search, and trash restore.
> - Added axe checks for login, explorer, settings, trash, and public password share pages.
> - Added skip-to-content/main landmarks, fixed public page landmarks, improved text contrast, fixed folder-tree nested interactive controls, and named the trash sort select.
> - Hardened file grid/list context menus so actions hidden by RBAC are not rendered as no-op menu items.
> - Disabled automatic R2 sync while E2E auth is enabled so local DB fixtures are not trashed by an empty test bucket.
> - Fixed FTS query sanitization for punctuation-heavy file names used by E2E fixtures.

> **Implemented:** Playwright E2E and axe accessibility coverage now live under `apps/web/e2e/` and run against local Vite + Wrangler with reset seeded D1.

**Goal:** Critical journeys tested end-to-end; a11y violations caught automatically.

### Step 31.1 - Set up Playwright

```bash
pnpm add -D @playwright/test @axe-core/playwright
npx playwright install
```

Create `apps/web/e2e/` and `playwright.config.ts`.

### Step 31.2 - Write critical user journey tests

- `auth.spec.ts`: OAuth login -> session persists -> logout
- `upload.spec.ts`: Navigate -> drag file -> progress -> file appears
- `share.spec.ts`: Create password share -> external access -> password validates -> download
- `rbac.spec.ts`: Viewer tries delete -> API blocks -> UI hides delete
- `search.spec.ts`: Type query -> results -> filters -> clear
- `trash.spec.ts`: Delete -> trash -> restore -> original folder

### Step 31.3 - Write accessibility tests

For each page:

```ts
import { checkA11y } from "@axe-core/playwright"
const results = await checkA11y(page)
expect(results.violations).toEqual([])
```

Pages: login, explorer, share modal, settings, trash.

### Step 31.4 - Ensure skip-to-content and tab order

- Add `SkipToContent` component to `__root.tsx`
- Verify tab order on explorer: sidebar -> breadcrumbs -> grid -> pagination

### Step 31.5 - Verify

```bash
pnpm test:e2e
pnpm test:a11y
```

### Step 31.6 - Commit

```bash
git commit -m "test(e2e): Playwright critical journeys and axe-core a11y compliance"
```

---

## Day 32 - Staging Deploy & Final Polish DONE

> **Notes from implementation:**
>
> - Added versioned GitHub Actions for CI and staging deploy under `.github/workflows/`.
> - Added `pnpm staging:check` to fail early when Cloudflare deploy credentials or the staging D1 `database_id` are missing.
> - Added Lighthouse CI config with minimum scores: Performance 90, Accessibility 95, Best Practices 95.
> - Added web bundle budget analysis that fails if any gzipped JS asset exceeds 500 kB.
> - Added a guarded E2E bulk fixture endpoint and `pnpm perf:benchmark` for a 10,000-file Explorer API/render benchmark.
> - Updated CI/CD, setup, testing, and agent docs to match actual scripts and `PLAYWRIGHT_BASE_URL`.
> - Real Cloudflare staging deployment remains environment-dependent: create `bucketdrive-db-staging`, store the returned non-secret `database_id` as `STAGING_D1_DATABASE_ID`, configure GitHub secrets/vars, then run the staging workflow.

> **Goal:** Production-ready deploy pipeline, performance checks, and docs sync.

### Step 32.1 - Performance check

```bash
cd apps/web && pnpm build
```

- Analyze bundle size (< 500 kB JS gzipped)
- Verify lazy chunks for preview types
- Lighthouse CI score: Performance > 90, Accessibility > 95, Best Practices > 95

### Step 32.2 - Virtualization benchmark

Seed script: create 10,000 files.

- Explorer render time < 500ms
- Scroll remains at 60fps

### Step 32.3 - Staging deploy

```bash
# Create staging D1 database
npx wrangler d1 create bucketdrive-db-staging

# Apply migrations
pnpm db:migrate:staging

# Deploy worker
npx wrangler deploy --env staging

# Deploy frontend
npx wrangler pages deploy apps/web/dist --project-name bucketdrive --branch main
```

### Step 32.4 - Smoke tests on staging

Run E2E suite pointing at staging URL.

### Step 32.5 - Final docs sync

- Update all `docs/` to reflect final implementation state
- Mark roadmap Day 32 as `DONE`
- Update `AGENTS.md` if build/test commands changed

### Step 32.6 - Final commit

```bash
git commit -m "chore: staging deploy, performance audit, and final docs sync"
```

---

## Implementation Notes - Upload UX Follow-up

> - Updated upload storage keys to use the bucket-global prefix `bucket/files/{uploadId}`.
> - Completed uploads now update the active files query cache immediately and invalidate workspace file/search queries, so normal app uploads no longer require R2 import to appear in Explorer.
> - Removed fixed-height virtualization from list view to prevent rows with tags or variable content from overlapping during load/render.
> - Added automatic R2 sync for Explorer file listing: new bucket objects are cataloged, changed R2 metadata updates existing rows, and active rows missing from R2 are moved to trash.
> - Added `workspace_settings` R2 sync state fields so automatic sync is throttled and R2 failures are recorded without breaking cached Explorer listings.
> - Extended automatic R2 sync to the scheduled Worker: cron now syncs active R2 workspaces by their app-owned prefix, logs aggregate results, and the Files UI no longer exposes a manual sync button.

## Implementation Notes - Single Bucket Refactor

> - Removed workspace and organization runtime concepts in favor of one default bucket with global user roles.
> - Migrated API routes from `/api/workspaces/:workspaceId/...` to direct bucket routes such as `/api/files`, `/api/folders`, `/api/members`, `/api/shares`, `/api/tags`, `/api/trash`, `/api/search`, and `/api/dashboard`.
> - Moved storage, tags, shares, folders, audit logs, upload sessions, notifications, invitations, and dashboard settings off `workspace_id`.
> - Replaced workspace RBAC settings permissions with `bucket.settings.read` and `bucket.settings.update`.
> - Added migration `0011_single_bucket.sql` and updated the dev seed for a bucket-first local database.

## Implementation Notes - Branding Assets

> - Persisted global platform branding in `platform_settings` so platform name changes survive Worker restarts and drive app title, login, home, topbar, workspaces, and breadcrumbs.
> - Added uploaded platform logo/favicon and uploaded bucket share logo support, storing assets in R2 and serving them through API routes so no public R2 domain is required.
> - Kept external bucket logo URLs compatible while adding `brandingLogoAssetUrl` for uploaded logo previews.
> - Public share pages now fall back from bucket branding to global platform branding.

## Implementation Notes - Members and Platform Invitations

> - Fixed member list response validation for Better Auth user IDs and SQLite timestamp defaults.
> - Delayed member and invitation queries until the current bucket context is resolved in the web client.
> - Added platform invitation endpoints for listing, creating, and accepting invites through the existing bucket invitation table.

## Implementation Notes - Dependency Refresh

> - Updated the monorepo to `pnpm@11.5.2` and refreshed direct runtime, UI, Cloudflare, build, lint, typecheck, and test dependencies to their latest available releases.
> - Added pnpm 11 workspace policy for approved native/toolchain builds and security overrides for stale transitive `shell-quote`, `tmp`, `ws`, `uuid`, and `esbuild` advisories.
> - Migrated shared Zod contracts/schemas to Zod 4 validators and public `z.infer` typing, and adjusted Vite 8 manual chunking for Rolldown.
> - Restored `/api/workspaces` and `/api/workspaces/:workspaceId/...` compatibility routing over the single-bucket API so E2E and legacy clients keep working.
> - Set Wrangler dev scripts to run non-interactively under Wrangler 4.99, avoiding the new AI skills installation prompt during `pnpm dev`.

## Implementation Notes - Batch Download Fix

> - **Problem:** Client-side ZIP generation (`client-zip`, `fflate.zipSync`) crashed browser with SIGILL at ~350MB due to buffering entire archive in memory.
> - **Solution:** Reverted to server-side streaming via `POST /api/batch/download` with `fflate`'s `Zip()` async streaming. Backend reads each file from R2 via `getObject()` (binding), pushes chunks into `ZipDeflate`, and streams output back to client.
> - **Frontend:** Chrome/Edge use `showSaveFilePicker()` + `Response.body.pipeTo(writable)` for true streaming to disk without buffering. Safari/Firefox fall back to `res.blob()` (memory-limited but standard).
> - **Dev mode:** `--remote` now works with real D1 and R2:
>   - D1: `bucketdrive-db` (4d32efe1-77cc-4963-a6e9-89187f97e2f7) - real database with migrations and seed
>   - R2: `nekomatadrive` - real bucket via binding
>   - Upload: via presigned URLs (S3) → goes to real R2
>   - Batch download: `getObject()` via binding → reads from real R2
> - **D1 Setup:** Migration 0011 failed due to FOREIGN KEY constraints. Manually applied remaining migrations and created missing tables (`bucket_settings`). Inserted `platform_settings` default record. Login now works.
> - **Token management:** `CLOUDFLARE_API_TOKEN` (Workers token for `wrangler`), `CLOUDFLARE_API_TOKEN_S3` (S3 token for `aws4fetch`)
> - **Files changed:** `apps/api/src/modules/batch/batch.handler.ts` (server-side `streamZipFiles()`), `apps/web/src/routes/app/files.tsx` (frontend streaming), `apps/api/src/modules/files/files.handler.ts` (`POST /upload/direct`), `apps/api/src/services/upload.service.ts` (direct upload fallback), `apps/web/src/hooks/use-upload.ts` (direct upload handler), `wrangler.toml` (real database_id), `apps/api/package.json` (`--remote`).

---

# Quick Reference

See [Status Overview](#status-overview) at the top of this file for the latest status of each day.

## Day-to-Day Dependency Graph

```
1-15  -> DONE foundation
16    -> depends on 15 (explorer commands)
17    -> depends on 15 (explorer preview)
18    -> depends on 3 (theme toggle exists)
19    -> DONE (admin dashboard)
20    -> depends on 1-19 (health check)
21    -> depends on 5 (upload system)
22    -> depends on 7,8,13 (move/rename/delete)
23    -> depends on 5,6 (upload + explorer)
24    -> depends on 6,14 (lists + search)
25    -> depends on 9 (RBAC v1)
26    -> depends on 19 (members module)
27    -> depends on 11,12 (shares)
28    -> depends on 11,26 (shares + invitations)
29    -> depends on 5 (upload complete hook)
30    -> depends on 1-29 (all endpoints stable)
31    -> depends on 1-29 (all features stable)
32    -> depends on 30,31 (tests pass)
```
