import Database from "better-sqlite3"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, vi } from "vitest"
import { ApiErrorSchema, type WorkspaceRole } from "@bucketdrive/shared"
import app from "../../index"
import { resetD1DBForTests } from "../../lib/db"

const mockedAuthState = vi.hoisted(() => ({
  users: new Map<string, { id: string; email: string; name: string }>(),
}))

vi.mock("../../lib/auth", () => ({
  createAuth: () => ({
    api: {
      getSession: ({ headers }: { headers: Headers }) => {
        const userId = headers.get("x-test-user-id")
        if (!userId) return null

        const user = mockedAuthState.users.get(userId)
        if (!user) return null

        return {
          user,
          session: {
            id: `session-${user.id}`,
            userId: user.id,
            expiresAt: new Date("2030-01-01T00:00:00.000Z"),
          },
        }
      },
    },
    handler: () => Response.json(null),
  }),
}))

vi.mock("@cf-wasm/photon/workerd", () => ({
  PhotonImage: {
    new_from_byteslice: vi.fn(() => ({
      get_width: vi.fn(() => 100),
      get_height: vi.fn(() => 100),
      free: vi.fn(),
    })),
  },
  resize: vi.fn(() => ({ get_bytes_webp: vi.fn(() => new Uint8Array([1, 2, 3])), free: vi.fn() })),
  SamplingFilter: { Lanczos3: "Lanczos3" },
}))

type SqliteValue = string | number | bigint | null | Uint8Array

interface TestD1Result {
  results?: Array<Record<string, unknown>>
  success: boolean
  meta: Record<string, unknown>
}

interface TestContext {
  sqlite: Database.Database
  env: {
    DB: D1Database
    STORAGE: R2Bucket
    BETTER_AUTH_SECRET: string
    BETTER_AUTH_URL: string
    APP_URL: string
    API_URL: string
    R2_BUCKET_NAME: string
    R2_ACCESS_KEY_ID: string
    R2_SECRET_ACCESS_KEY: string
    R2_ENDPOINT: string
  }
  owner: TestUser
  admin: TestUser
  viewer: TestUser
  outsider: TestUser
  workspaceId: string
  bucketId: string
  request: (path: string, init?: RequestInit & { userId?: string | null }) => Promise<Response>
  json: <T = unknown>(response: Response) => Promise<T>
  seedUser: (input?: Partial<TestUser> & { role?: WorkspaceRole | null }) => TestUser
  seedFolder: (input?: Partial<TestFolder>) => TestFolder
  seedFile: (input?: Partial<TestFile>) => TestFile
  seedTag: (input?: Partial<TestTag>) => TestTag
  seedShare: (input?: Partial<TestShare>) => TestShare
  seedNotification: (input?: Partial<TestNotification>) => TestNotification
  seedInvitation: (input?: Partial<TestInvitation>) => TestInvitation
  now: string
}

interface TestUser {
  id: string
  email: string
  name: string
  isPlatformAdmin: boolean
  canCreateWorkspaces: boolean
}

interface TestFolder {
  id: string
  workspaceId: string
  parentFolderId: string | null
  name: string
  path: string
  createdBy: string
  isDeleted: boolean
  deletedAt: string | null
}

interface TestFile {
  id: string
  workspaceId: string
  bucketId: string
  folderId: string | null
  ownerId: string
  storageKey: string
  originalName: string
  mimeType: string
  extension: string | null
  sizeBytes: number
  thumbnailKey: string | null
  isDeleted: boolean
  deletedAt: string | null
}

interface TestTag {
  id: string
  workspaceId: string
  name: string
  color: string
}

interface TestShare {
  id: string
  workspaceId: string
  resourceType: "file" | "folder"
  resourceId: string
  shareType: "internal" | "external_direct" | "external_explorer"
  createdBy: string
  passwordHash: string | null
  expiresAt: string | null
  isActive: boolean
}

interface TestNotification {
  id: string
  userId: string
  workspaceId: string | null
  type: string
  title: string
  message: string
  isRead: boolean
}

interface TestInvitation {
  id: string
  workspaceId: string
  email: string
  token: string
  role: WorkspaceRole
  invitedBy: string
  status: "pending" | "accepted" | "revoked" | "expired"
  expiresAt: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "../../../../../")
const migrationsDir = resolve(repoRoot, "packages/shared/src/db/migrations")

let idCounter = 1

afterEach(() => {
  mockedAuthState.users.clear()
  resetD1DBForTests()
})

export function createContractTestContext(): TestContext {
  idCounter = 1
  mockedAuthState.users.clear()

  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = OFF")
  applyMigrations(sqlite)

  const d1 = createD1Binding(sqlite)
  const storage = createR2BucketMock()
  const now = "2026-06-02T12:00:00.000Z"
  const workspaceId = testId()
  const bucketId = testId()

  const env = {
    DB: d1,
    STORAGE: storage,
    BETTER_AUTH_SECRET: "test-secret",
    BETTER_AUTH_URL: "http://localhost:8787",
    APP_URL: "http://localhost:5173",
    API_URL: "http://localhost:8787",
    R2_BUCKET_NAME: "bucketdrive-test",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key",
    R2_ENDPOINT: "https://r2.example.com",
  }

  const ctxBase = {
    sqlite,
    env,
    workspaceId,
    bucketId,
    now,
    request: async (path, init = {}) => {
      const { userId, ...requestInit } = init
      const headers = new Headers(requestInit.headers)
      const globalPath = path.replace(/^\/api\/workspaces\/[^/]+(?=\/)/, "/api")
      if (init.userId !== null && !headers.has("x-test-user-id")) {
        headers.set("x-test-user-id", userId ?? ctxBase.owner.id)
      }
      if (typeof init.body === "string" && !headers.has("content-type")) {
        headers.set("content-type", "application/json")
      }

      const executionContext = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
        props: {},
      } satisfies ExecutionContext

      return app.fetch(
        new Request(`http://localhost:8787${globalPath}`, {
          ...requestInit,
          headers,
        }),
        env,
        executionContext,
      )
    },
    json: async <T = unknown>(response: Response) => response.json() as Promise<T>,
    seedUser: (input = {}) => seedUser(sqlite, workspaceId, now, input),
    seedFolder: (input = {}) => seedFolder(sqlite, workspaceId, ctxBase.owner.id, now, input),
    seedFile: (input = {}) => seedFile(sqlite, workspaceId, bucketId, ctxBase.owner.id, now, input),
    seedTag: (input = {}) => seedTag(sqlite, workspaceId, now, input),
    seedShare: (input = {}) => seedShare(sqlite, workspaceId, ctxBase.owner.id, now, input),
    seedNotification: (input = {}) =>
      seedNotification(sqlite, ctxBase.owner.id, workspaceId, now, input),
    seedInvitation: (input = {}) =>
      seedInvitation(sqlite, workspaceId, ctxBase.owner.id, now, input),
  } as TestContext

  ctxBase.owner = ctxBase.seedUser({
    id: testId(),
    email: "owner@example.com",
    name: "Owner",
    role: null,
    isPlatformAdmin: true,
    canCreateWorkspaces: true,
  })
  ctxBase.admin = ctxBase.seedUser({
    id: testId(),
    email: "admin@example.com",
    name: "Admin",
    role: null,
  })
  ctxBase.viewer = ctxBase.seedUser({
    id: testId(),
    email: "viewer@example.com",
    name: "Viewer",
    role: null,
  })
  ctxBase.outsider = ctxBase.seedUser({
    id: testId(),
    email: "outsider@example.com",
    name: "Outsider",
    role: "guest",
  })

  sqlite
    .prepare(
      "insert into bucket (id, name, provider, visibility, created_at) values (?, ?, 'r2', 'private', ?)",
    )
    .run(bucketId, "bucketdrive-test", now)
  sqlite
    .prepare(
      `insert into bucket_settings
      (id, bucket_id, storage_quota_bytes, default_share_expiration_days, enable_public_signup,
       trash_retention_days, max_file_size_bytes, upload_chunk_size_bytes, r2_public_base_url,
       r2_last_sync_at, created_at, updated_at)
      values (?, ?, 10000000000, 30, 1, 30, 5368709120, 5242880, ?, ?, ?, ?)`,
    )
    .run(testId(), bucketId, "https://public.example.com", new Date().toISOString(), now, now)

  updateUserRole(sqlite, ctxBase.owner.id, "owner")
  updateUserRole(sqlite, ctxBase.admin.id, "admin")
  updateUserRole(sqlite, ctxBase.viewer.id, "viewer")

  return ctxBase
}

export function expectApiError(body: unknown) {
  expect(ApiErrorSchema.safeParse(body).success).toBe(true)
}

function createD1Binding(sqlite: Database.Database): D1Database {
  return {
    prepare(query: string) {
      const statement = sqlite.prepare(query)
      const bound: SqliteValue[] = []
      const prepared = {
        bind(...params: SqliteValue[]) {
          bound.splice(0, bound.length, ...params)
          return prepared
        },
        all: (): Promise<TestD1Result> =>
          Promise.resolve({
            results: statement.all(...bound) as Array<Record<string, unknown>>,
            success: true,
            meta: {},
          }),
        get: (): Promise<Record<string, unknown> | null> =>
          Promise.resolve((statement.get(...bound) as Record<string, unknown> | undefined) ?? null),
        first: (): Promise<Record<string, unknown> | null> =>
          Promise.resolve((statement.get(...bound) as Record<string, unknown> | undefined) ?? null),
        run: (): Promise<TestD1Result> => {
          statement.run(...bound)
          return Promise.resolve({ success: true, meta: {} })
        },
        raw: (): Promise<unknown[][]> =>
          Promise.resolve(statement.raw().all(...bound) as unknown[][]),
      }
      return prepared
    },
    batch: async (statements: Array<{ run: () => Promise<TestD1Result> }>) => {
      const results: TestD1Result[] = []
      for (const statement of statements) {
        results.push(await statement.run())
      }
      return results
    },
    exec: (query: string) => {
      sqlite.exec(query)
      return Promise.resolve({ count: 0, duration: 0 })
    },
    dump: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as D1Database
}

function createR2BucketMock(): R2Bucket {
  const objects = new Map<string, Uint8Array>()
  const contentTypes = new Map<string, string>()
  return {
    put: vi.fn(
      (
        key: string,
        body: ArrayBuffer | Uint8Array | string,
        options?: { httpMetadata?: { contentType?: string } },
      ) => {
        const bytes =
          typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body)
        objects.set(key, bytes)
        if (options?.httpMetadata?.contentType) {
          contentTypes.set(key, options.httpMetadata.contentType)
        }
        return Promise.resolve(null)
      },
    ),
    get: vi.fn((key: string) => {
      const body = objects.get(key) ?? new TextEncoder().encode("test")
      return Promise.resolve({
        key,
        size: body.byteLength,
        etag: "etag-test",
        httpEtag: '"etag-test"',
        uploaded: new Date("2026-06-02T12:00:00.000Z"),
        httpMetadata: { contentType: contentTypes.get(key) },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(body)
            controller.close()
          },
        }),
        writeHttpMetadata: vi.fn(),
      })
    }),
    head: vi.fn((key: string) => {
      const body = objects.get(key)
      if (!body) return Promise.resolve(null)

      return Promise.resolve({
        key,
        size: body.byteLength,
        etag: "etag-test",
        httpEtag: '"etag-test"',
        uploaded: new Date("2026-06-02T12:00:00.000Z"),
        httpMetadata: { contentType: contentTypes.get(key) },
        writeHttpMetadata: vi.fn(),
      })
    }),
    delete: vi.fn(() => Promise.resolve(undefined)),
    list: vi.fn(() => Promise.resolve({ objects: [], truncated: false, delimitedPrefixes: [] })),
    createMultipartUpload: vi.fn((key: string) =>
      Promise.resolve({
        key,
        uploadId: "multipart-upload",
        uploadPart: vi.fn((_partNumber: number) => Promise.resolve({ etag: "etag-part" })),
        complete: vi.fn(() => Promise.resolve({})),
        abort: vi.fn(() => Promise.resolve(undefined)),
      }),
    ),
    resumeMultipartUpload: vi.fn((_key: string, uploadId: string) => ({
      uploadId,
      uploadPart: vi.fn((_partNumber: number) => Promise.resolve({ etag: "etag-part" })),
      complete: vi.fn(() => Promise.resolve({})),
      abort: vi.fn(() => Promise.resolve(undefined)),
    })),
  } as unknown as R2Bucket
}

function applyMigrations(sqlite: Database.Database) {
  const migrationNames = [
    "sad_wendell_vaughn",
    "opposite_adam_warlock",
    "gentle_raven",
    "great_sharon_ventura",
    "oval_krista_starr",
    "mature_blue_blade",
    "talented_clea",
    "brainy_sandman",
    "parched_eternity",
    "public_r2_base_url",
    "r2_sync_state",
    "single_bucket",
    "branding_assets",
    "default_language",
  ]

  for (const [index, name] of migrationNames.entries()) {
    const prefix = String(index).padStart(4, "0")
    const path = resolve(migrationsDir, `${prefix}_${name}.sql`)
    sqlite.exec(readFileSync(path, "utf8"))
  }
}

function seedUser(
  sqlite: Database.Database,
  workspaceId: string,
  now: string,
  input: Partial<TestUser> & { role?: WorkspaceRole | null } = {},
): TestUser {
  const user: TestUser = {
    id: input.id ?? testId(),
    email: input.email ?? `user-${String(idCounter)}@example.com`,
    name: input.name ?? "Test User",
    isPlatformAdmin: input.isPlatformAdmin ?? false,
    canCreateWorkspaces: input.canCreateWorkspaces ?? false,
  }

  sqlite
    .prepare(
      `insert into user
      (id, name, email, email_verified, image, is_platform_admin, role, created_at, updated_at)
      values (?, ?, ?, 1, null, ?, ?, ?, ?)`,
    )
    .run(
      user.id,
      user.name,
      user.email,
      user.isPlatformAdmin ? 1 : 0,
      input.role ?? "viewer",
      now,
      now,
    )
  mockedAuthState.users.set(user.id, user)

  if (input.role) {
    updateUserRole(sqlite, user.id, input.role)
  }

  return user
}

function updateUserRole(sqlite: Database.Database, userId: string, role: WorkspaceRole) {
  sqlite.prepare("update user set role = ? where id = ?").run(role, userId)
}

function seedFolder(
  sqlite: Database.Database,
  workspaceId: string,
  ownerId: string,
  now: string,
  input: Partial<TestFolder> = {},
): TestFolder {
  const folder: TestFolder = {
    id: input.id ?? testId(),
    workspaceId,
    parentFolderId: input.parentFolderId ?? null,
    name: input.name ?? "Documents",
    path: input.path ?? `/${input.name ?? "Documents"}`,
    createdBy: input.createdBy ?? ownerId,
    isDeleted: input.isDeleted ?? false,
    deletedAt: input.deletedAt ?? null,
  }

  sqlite
    .prepare(
      `insert into folder
      (id, parent_folder_id, name, path, created_by, is_deleted, deleted_at, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      folder.id,
      folder.parentFolderId,
      folder.name,
      folder.path,
      folder.createdBy,
      folder.isDeleted ? 1 : 0,
      folder.deletedAt,
      now,
      now,
    )

  return folder
}

function seedFile(
  sqlite: Database.Database,
  workspaceId: string,
  bucketId: string,
  ownerId: string,
  now: string,
  input: Partial<TestFile> = {},
): TestFile {
  const name = input.originalName ?? "Contract.txt"
  const file: TestFile = {
    id: input.id ?? testId(),
    workspaceId,
    bucketId,
    folderId: input.folderId ?? null,
    ownerId: input.ownerId ?? ownerId,
    storageKey: input.storageKey ?? `bucket/files/${testId()}/${name}`,
    originalName: name,
    mimeType: input.mimeType ?? "text/plain",
    extension: input.extension ?? "txt",
    sizeBytes: input.sizeBytes ?? 42,
    thumbnailKey: input.thumbnailKey ?? null,
    isDeleted: input.isDeleted ?? false,
    deletedAt: input.deletedAt ?? null,
  }

  sqlite
    .prepare(
      `insert into file_object
      (id, bucket_id, folder_id, owner_id, storage_key, original_name, mime_type, extension,
       size_bytes, checksum, thumbnail_key, metadata, is_deleted, deleted_at, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, null, ?, ?, ?, ?)`,
    )
    .run(
      file.id,
      file.bucketId,
      file.folderId,
      file.ownerId,
      file.storageKey,
      file.originalName,
      file.mimeType,
      file.extension,
      file.sizeBytes,
      file.thumbnailKey,
      file.isDeleted ? 1 : 0,
      file.deletedAt,
      now,
      now,
    )

  return file
}

function seedTag(
  sqlite: Database.Database,
  workspaceId: string,
  now: string,
  input: Partial<TestTag> = {},
): TestTag {
  const tag = {
    id: input.id ?? testId(),
    workspaceId,
    name: input.name ?? "Important",
    color: input.color ?? "#ff0000",
  }
  sqlite
    .prepare("insert into file_tag (id, name, color, created_at) values (?, ?, ?, ?)")
    .run(tag.id, tag.name, tag.color, now)
  return tag
}

function seedShare(
  sqlite: Database.Database,
  workspaceId: string,
  ownerId: string,
  now: string,
  input: Partial<TestShare> = {},
): TestShare {
  const share = {
    id: input.id ?? testId(),
    workspaceId,
    resourceType: input.resourceType ?? "file",
    resourceId: input.resourceId ?? testId(),
    shareType: input.shareType ?? "external_direct",
    createdBy: input.createdBy ?? ownerId,
    passwordHash: input.passwordHash ?? null,
    expiresAt: input.expiresAt ?? null,
    isActive: input.isActive ?? true,
  } satisfies TestShare
  sqlite
    .prepare(
      `insert into share_link
      (id, resource_type, resource_id, share_type, created_by, password_hash, expires_at,
       access_count, download_count, is_active, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
    )
    .run(
      share.id,
      share.resourceType,
      share.resourceId,
      share.shareType,
      share.createdBy,
      share.passwordHash,
      share.expiresAt,
      share.isActive ? 1 : 0,
      now,
      now,
    )
  sqlite
    .prepare("insert into share_permission (id, share_link_id, permission) values (?, ?, 'read')")
    .run(testId(), share.id)
  return share
}

function seedNotification(
  sqlite: Database.Database,
  userId: string,
  workspaceId: string,
  now: string,
  input: Partial<TestNotification> = {},
): TestNotification {
  const notification = {
    id: input.id ?? testId(),
    userId: input.userId ?? userId,
    workspaceId: input.workspaceId ?? workspaceId,
    type: input.type ?? "member.invited",
    title: input.title ?? "Notification",
    message: input.message ?? "A notification was created",
    isRead: input.isRead ?? false,
  }
  sqlite
    .prepare(
      `insert into notification
      (id, user_id, type, title, message, data, is_read, created_at)
      values (?, ?, ?, ?, ?, null, ?, ?)`,
    )
    .run(
      notification.id,
      notification.userId,
      notification.type,
      notification.title,
      notification.message,
      notification.isRead ? 1 : 0,
      now,
    )
  return notification
}

function seedInvitation(
  sqlite: Database.Database,
  workspaceId: string,
  ownerId: string,
  now: string,
  input: Partial<TestInvitation> = {},
): TestInvitation {
  const invitation = {
    id: input.id ?? testId(),
    workspaceId,
    email: input.email ?? "invitee@example.com",
    token: input.token ?? `token-${String(idCounter)}`,
    role: input.role ?? "viewer",
    invitedBy: input.invitedBy ?? ownerId,
    status: input.status ?? "pending",
    expiresAt: input.expiresAt ?? "2030-01-01T00:00:00.000Z",
  } satisfies TestInvitation
  sqlite
    .prepare(
      `insert into bucket_invitation
      (id, email, token, role, invited_by, status, expires_at, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      invitation.id,
      invitation.email,
      invitation.token,
      invitation.role,
      invitation.invitedBy,
      invitation.status,
      invitation.expiresAt,
      now,
      now,
    )
  return invitation
}

function testId() {
  const value = String(idCounter).padStart(12, "0")
  idCounter += 1
  return `00000000-0000-4000-8000-${value}`
}
