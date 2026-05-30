import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as schema from "@bucketdrive/shared/db/schema"
import { bucket, fileObject, workspaceSettings } from "@bucketdrive/shared/db/schema"
import { R2ImportService } from "../r2-import.service"
import type { StorageProvider } from "../storage"

const dbMock = vi.hoisted(() => ({
  getDB: vi.fn(),
}))

vi.mock("../../lib/db", () => ({
  getDB: dbMock.getDB,
}))

const setupSql = `
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
    list: vi.fn().mockResolvedValue({ objects, truncated: false }),
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
})
