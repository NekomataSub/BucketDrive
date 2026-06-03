import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as schema from "@bucketdrive/shared/db/schema"
import { bucket, fileObject, folder, workspace, workspaceSettings } from "@bucketdrive/shared/db/schema"
import { R2ImportService, syncAllR2Workspaces } from "../r2-import.service"
import type { StorageProvider } from "../storage"

const dbMock = vi.hoisted(() => ({
  getDB: vi.fn(),
}))

vi.mock("../../lib/db", () => ({
  getDB: dbMock.getDB,
}))

const setupSql = `
CREATE TABLE workspace (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_id text NOT NULL,
  storage_quota_bytes integer DEFAULT 10737418240 NOT NULL,
  is_deleted integer DEFAULT false NOT NULL,
  is_platform_default integer DEFAULT false NOT NULL,
  deleted_at text,
  created_at text DEFAULT (current_timestamp) NOT NULL,
  updated_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE bucket (
  id text PRIMARY KEY NOT NULL,
  workspace_id text NOT NULL,
  name text NOT NULL,
  provider text DEFAULT 'r2' NOT NULL,
  region text,
  visibility text DEFAULT 'private' NOT NULL,
  created_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE workspace_settings (
  id text PRIMARY KEY NOT NULL,
  workspace_id text NOT NULL UNIQUE,
  default_share_expiration_days integer DEFAULT 30 NOT NULL,
  enable_public_signup integer DEFAULT false NOT NULL,
  trash_retention_days integer DEFAULT 30 NOT NULL,
  max_file_size_bytes integer DEFAULT 5368709120 NOT NULL,
  upload_chunk_size_bytes integer DEFAULT 5242880 NOT NULL,
  allowed_mime_types text,
  branding_logo_url text,
  branding_name text,
  r2_public_base_url text,
  r2_last_sync_at text,
  r2_sync_status text DEFAULT 'idle' NOT NULL,
  r2_sync_error text,
  created_at text DEFAULT (current_timestamp) NOT NULL,
  updated_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE folder (
  id text PRIMARY KEY NOT NULL,
  workspace_id text NOT NULL,
  parent_folder_id text,
  name text NOT NULL,
  path text NOT NULL,
  created_by text NOT NULL,
  is_deleted integer DEFAULT false NOT NULL,
  deleted_at text,
  created_at text DEFAULT (current_timestamp) NOT NULL,
  updated_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE file_object (
  id text PRIMARY KEY NOT NULL,
  workspace_id text NOT NULL,
  bucket_id text NOT NULL,
  folder_id text,
  owner_id text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  extension text,
  size_bytes integer DEFAULT 0 NOT NULL,
  checksum text,
  thumbnail_key text,
  metadata text,
  is_deleted integer DEFAULT false NOT NULL,
  deleted_at text,
  created_at text DEFAULT (current_timestamp) NOT NULL,
  updated_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE audit_log (
  id text PRIMARY KEY NOT NULL,
  workspace_id text NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  ip_address text,
  user_agent text,
  metadata text,
  created_at text DEFAULT (current_timestamp) NOT NULL
);
`

function createStorage(objects: Awaited<ReturnType<StorageProvider["list"]>>["objects"]): StorageProvider {
  const storage: StorageProvider = {
    list: vi.fn().mockImplementation((options?: { prefix?: string }) => {
      const filtered = options?.prefix
        ? objects.filter((object) => object.key.startsWith(options.prefix ?? ""))
        : objects
      return Promise.resolve({ objects: filtered, truncated: false })
    }),
    generateSignedUploadUrl: vi.fn().mockResolvedValue(""),
    generateSignedDownloadUrl: vi.fn().mockResolvedValue(""),
    delete: vi.fn().mockResolvedValue(undefined),
    copy: vi.fn().mockResolvedValue(undefined),
    createMultipartUpload: vi.fn().mockResolvedValue({ uploadId: "upload-1" }),
    generateSignedUploadPartUrl: vi.fn().mockResolvedValue(""),
    completeMultipartUpload: vi.fn().mockResolvedValue(undefined),
    abortMultipartUpload: vi.fn().mockResolvedValue(undefined),
  }
  return storage
}

describe("R2ImportService sync", () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeEach(() => {
    sqlite = new Database(":memory:")
    sqlite.exec(setupSql)
    db = drizzle(sqlite, { schema })
    dbMock.getDB.mockReturnValue(db)

    db.insert(workspace).values({
      id: "workspace-1",
      name: "Workspace 1",
      slug: "workspace-1",
      ownerId: "owner-1",
      isDeleted: false,
    }).run()

    db.insert(bucket).values({
      id: "bucket-1",
      workspaceId: "workspace-1",
      name: "test-bucket",
      provider: "r2",
      visibility: "private",
    }).run()

    db.insert(workspaceSettings).values({
      id: "settings-1",
      workspaceId: "workspace-1",
    }).run()
  })

  afterEach(() => {
    sqlite.close()
    dbMock.getDB.mockReset()
  })

  it("imports new R2 objects", async () => {
    const service = new R2ImportService(createStorage([
      { key: "docs/AGENTS.md", size: 128, uploaded: new Date("2026-05-29T00:00:00.000Z") },
    ]))

    const result = await service.syncWorkspace({ workspaceId: "workspace-1", userId: "user-1" })
    const files = db.select().from(fileObject).all()

    expect(result.imported).toBe(1)
    expect(files).toHaveLength(1)
    expect(files[0]?.originalName).toBe("AGENTS.md")
    expect(files[0]?.isDeleted).toBe(false)
  })

  it("preserves R2 folder paths instead of flattening nested objects into root", async () => {
    const service = new R2ImportService(createStorage([
      { key: "bucketdrive/videos/demo.mp4", size: 128 },
    ]))

    const result = await service.syncWorkspace({ workspaceId: "workspace-1", userId: "user-1" })
    const folders = db.select().from(folder).all()
    const files = db.select().from(fileObject).all()

    expect(result.imported).toBe(1)
    expect(folders.map((row) => row.path).sort()).toEqual(["/bucketdrive", "/bucketdrive/videos"])
    expect(files[0]?.originalName).toBe("demo.mp4")
    expect(files[0]?.folderId).toBe(folders.find((row) => row.path === "/bucketdrive/videos")?.id)
  })

  it("infers video mime types when R2 reports generic octet-stream", async () => {
    const service = new R2ImportService(createStorage([
      {
        key: "videos/trailer.mov",
        size: 128,
        httpMetadata: { contentType: "application/octet-stream" },
      },
    ]))

    const result = await service.syncWorkspace({ workspaceId: "workspace-1", userId: "user-1" })
    const [file] = db.select().from(fileObject).all()

    expect(result.imported).toBe(1)
    expect(file?.mimeType).toBe("video/quicktime")
  })

  it("updates existing metadata without duplicating files", async () => {
    db.insert(fileObject).values({
      id: "file-1",
      workspaceId: "workspace-1",
      bucketId: "bucket-1",
      ownerId: "user-1",
      storageKey: "report.txt",
      originalName: "report.txt",
      mimeType: "text/plain",
      extension: ".txt",
      sizeBytes: 10,
    }).run()

    const service = new R2ImportService(createStorage([
      { key: "report.txt", size: 20, httpMetadata: { contentType: "text/markdown" } },
    ]))

    const result = await service.syncWorkspace({ workspaceId: "workspace-1", userId: "user-1" })
    const files = db.select().from(fileObject).all()

    expect(result.updated).toBe(1)
    expect(files).toHaveLength(1)
    expect(files[0]?.sizeBytes).toBe(20)
    expect(files[0]?.mimeType).toBe("text/markdown")
  })

  it("moves active database files missing from R2 to trash", async () => {
    db.insert(fileObject).values({
      id: "file-1",
      workspaceId: "workspace-1",
      bucketId: "bucket-1",
      ownerId: "user-1",
      storageKey: "missing.txt",
      originalName: "missing.txt",
      mimeType: "text/plain",
      extension: ".txt",
      sizeBytes: 10,
    }).run()

    const service = new R2ImportService(createStorage([]))

    const result = await service.syncWorkspace({ workspaceId: "workspace-1", userId: "user-1" })
    const [file] = db.select().from(fileObject).all()

    expect(result.deleted).toBe(1)
    expect(file?.isDeleted).toBe(true)
    expect(file?.deletedAt).not.toBeNull()
  })

  it("does not restore files already in trash", async () => {
    db.insert(fileObject).values({
      id: "file-1",
      workspaceId: "workspace-1",
      bucketId: "bucket-1",
      ownerId: "user-1",
      storageKey: "trashed.txt",
      originalName: "trashed.txt",
      mimeType: "text/plain",
      extension: ".txt",
      sizeBytes: 10,
      isDeleted: true,
      deletedAt: "2026-05-29T00:00:00.000Z",
    }).run()

    const service = new R2ImportService(createStorage([
      { key: "trashed.txt", size: 10, httpMetadata: { contentType: "text/plain" } },
    ]))

    const result = await service.syncWorkspace({ workspaceId: "workspace-1", userId: "user-1" })
    const [file] = db.select().from(fileObject).all()

    expect(result.skipped).toBe(1)
    expect(file?.isDeleted).toBe(true)
  })

  it("records sync failure without changing existing files", async () => {
    db.insert(fileObject).values({
      id: "file-1",
      workspaceId: "workspace-1",
      bucketId: "bucket-1",
      ownerId: "user-1",
      storageKey: "safe.txt",
      originalName: "safe.txt",
      mimeType: "text/plain",
      extension: ".txt",
      sizeBytes: 10,
    }).run()

    const storage = createStorage([])
    storage.list = vi.fn().mockRejectedValueOnce(new Error("R2 unavailable"))
    const service = new R2ImportService(storage)

    await expect(service.syncWorkspace({ workspaceId: "workspace-1", userId: "user-1" })).rejects.toThrow(
      "R2 unavailable",
    )

    const [file] = db.select().from(fileObject).all()
    const [settings] = db.select().from(workspaceSettings).all()

    expect(file?.isDeleted).toBe(false)
    expect(settings?.r2SyncStatus).toBe("failed")
    expect(settings?.r2SyncError).toBe("R2 unavailable")
  })

  it("syncs all active R2 workspaces with workspace-owned prefixes", async () => {
    db.insert(workspace).values({
      id: "workspace-2",
      name: "Workspace 2",
      slug: "workspace-2",
      ownerId: "owner-2",
      isDeleted: false,
    }).run()
    db.insert(bucket).values({
      id: "bucket-2",
      workspaceId: "workspace-2",
      name: "test-bucket-2",
      provider: "r2",
      visibility: "private",
    }).run()
    db.insert(workspaceSettings).values({
      id: "settings-2",
      workspaceId: "workspace-2",
    }).run()

    const storage = createStorage([
      { key: "workspace/workspace-1/files/upload-1/report.txt", size: 128 },
      { key: "workspace/workspace-2/files/upload-2/photo.jpg", size: 256 },
      { key: "loose-root-file.txt", size: 512 },
    ])

    const result = await syncAllR2Workspaces({ storage, userId: "system" })
    const files = db.select().from(fileObject).all()

    expect(result.workspaces).toBe(2)
    expect(result.synced).toBe(2)
    expect(result.imported).toBe(2)
    expect(files).toHaveLength(2)
    expect(files.map((file) => file.workspaceId).sort()).toEqual(["workspace-1", "workspace-2"])
    expect(files.some((file) => file.storageKey === "loose-root-file.txt")).toBe(false)
  })

  it("skips deleted workspaces during global sync", async () => {
    db.insert(workspace).values({
      id: "workspace-2",
      name: "Deleted Workspace",
      slug: "deleted-workspace",
      ownerId: "owner-2",
      isDeleted: true,
    }).run()
    db.insert(bucket).values({
      id: "bucket-2",
      workspaceId: "workspace-2",
      name: "deleted-bucket",
      provider: "r2",
      visibility: "private",
    }).run()
    db.insert(workspaceSettings).values({
      id: "settings-2",
      workspaceId: "workspace-2",
    }).run()

    const result = await syncAllR2Workspaces({
      storage: createStorage([
        { key: "workspace/workspace-2/files/upload-1/deleted.txt", size: 128 },
      ]),
      userId: "system",
    })

    expect(result.workspaces).toBe(1)
    expect(result.imported).toBe(0)
    expect(db.select().from(fileObject).all()).toHaveLength(0)
  })

  it("continues global sync when one workspace fails", async () => {
    db.insert(workspace).values({
      id: "workspace-2",
      name: "Workspace 2",
      slug: "workspace-2",
      ownerId: "owner-2",
      isDeleted: false,
    }).run()
    db.insert(bucket).values({
      id: "bucket-2",
      workspaceId: "workspace-2",
      name: "test-bucket-2",
      provider: "r2",
      visibility: "private",
    }).run()
    db.insert(workspaceSettings).values({
      id: "settings-2",
      workspaceId: "workspace-2",
    }).run()

    const storage = createStorage([
      { key: "workspace/workspace-2/files/upload-2/photo.jpg", size: 256 },
    ])
    storage.list = vi.fn().mockImplementation((options?: { prefix?: string }) => {
      if (options?.prefix?.includes("workspace-1")) {
        return Promise.reject(new Error("workspace-1 unavailable"))
      }
      return Promise.resolve({
        objects: [{ key: "workspace/workspace-2/files/upload-2/photo.jpg", size: 256 }],
        truncated: false,
      })
    })

    const result = await syncAllR2Workspaces({ storage, userId: "system" })
    const [failedSettings] = db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, "workspace-1"))
      .all()

    expect(result.workspaces).toBe(2)
    expect(result.synced).toBe(1)
    expect(result.failedWorkspaces).toBe(1)
    expect(result.imported).toBe(1)
    expect(failedSettings?.r2SyncStatus).toBe("failed")
    expect(db.select().from(fileObject).all()).toHaveLength(1)
  })
})
