import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as schema from "@bucketdrive/shared/db/schema"
import { bucket, bucketSettings, fileObject, folder } from "@bucketdrive/shared/db/schema"
import { R2ImportService, syncAllR2Workspaces } from "../r2-import.service"
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
  name text NOT NULL,
  provider text DEFAULT 'r2' NOT NULL,
  region text,
  visibility text DEFAULT 'private' NOT NULL,
  created_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE bucket_settings (
  id text PRIMARY KEY NOT NULL,
  bucket_id text NOT NULL UNIQUE,
  storage_quota_bytes integer DEFAULT 10737418240 NOT NULL,
  default_share_expiration_days integer DEFAULT 30 NOT NULL,
  enable_public_signup integer DEFAULT false NOT NULL,
  trash_retention_days integer DEFAULT 30 NOT NULL,
  max_file_size_bytes integer DEFAULT 5368709120 NOT NULL,
  upload_chunk_size_bytes integer DEFAULT 5242880 NOT NULL,
  allowed_mime_types text,
  branding_logo_url text,
  branding_logo_key text,
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

CREATE TABLE file_object_tag (
  id text PRIMARY KEY NOT NULL,
  file_object_id text NOT NULL,
  tag_id text NOT NULL
);

CREATE TABLE favorite (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL,
  file_object_id text NOT NULL,
  is_active integer DEFAULT true NOT NULL,
  created_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE audit_log (
  id text PRIMARY KEY NOT NULL,
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

function createStorage(
  objects: Awaited<ReturnType<StorageProvider["list"]>>["objects"],
): StorageProvider {
  return {
    list: vi.fn().mockResolvedValue({ objects, truncated: false }),
    generateSignedUploadUrl: vi.fn().mockResolvedValue(""),
    generateSignedDownloadUrl: vi.fn().mockResolvedValue(""),
    upload: vi.fn().mockResolvedValue(undefined),
    getObject: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    copy: vi.fn().mockResolvedValue(undefined),
    createMultipartUpload: vi.fn().mockResolvedValue({ uploadId: "upload-1" }),
    generateSignedUploadPartUrl: vi.fn().mockResolvedValue(""),
    completeMultipartUpload: vi.fn().mockResolvedValue(undefined),
    abortMultipartUpload: vi.fn().mockResolvedValue(undefined),
  }
}

describe("R2ImportService sync", () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeEach(() => {
    sqlite = new Database(":memory:")
    sqlite.exec(setupSql)
    db = drizzle(sqlite, { schema })
    dbMock.getDB.mockReturnValue(db)

    db.insert(bucket)
      .values({ id: "bucket-1", name: "test-bucket", provider: "r2", visibility: "private" })
      .run()
    db.insert(bucketSettings).values({ id: "settings-1", bucketId: "bucket-1" }).run()
  })

  afterEach(() => {
    sqlite.close()
    dbMock.getDB.mockReset()
  })

  it("imports new R2 objects into the default bucket", async () => {
    const service = new R2ImportService(
      createStorage([
        { key: "docs/AGENTS.md", size: 128, uploaded: new Date("2026-05-29T00:00:00.000Z") },
      ]),
    )

    const result = await service.syncBucket({ userId: "user-1" })
    const files = db.select().from(fileObject).all()

    expect(result.imported).toBe(1)
    expect(files[0]?.bucketId).toBe("bucket-1")
    expect(files[0]?.originalName).toBe("AGENTS.md")
    expect(
      db
        .select()
        .from(folder)
        .all()
        .map((row) => row.path),
    ).toEqual(["/docs"])
  })

  it("updates existing metadata without duplicating files", async () => {
    db.insert(fileObject)
      .values({
        id: "file-1",
        bucketId: "bucket-1",
        ownerId: "user-1",
        storageKey: "report.txt",
        originalName: "report.txt",
        mimeType: "text/plain",
        extension: ".txt",
        sizeBytes: 10,
      })
      .run()

    const result = await new R2ImportService(
      createStorage([
        { key: "report.txt", size: 20, httpMetadata: { contentType: "text/markdown" } },
      ]),
    ).syncBucket({ userId: "user-1" })

    const files = db.select().from(fileObject).all()
    expect(result.updated).toBe(1)
    expect(files).toHaveLength(1)
    expect(files[0]?.sizeBytes).toBe(20)
    expect(files[0]?.mimeType).toBe("text/markdown")
  })

  it("moves active database files missing from R2 to trash", async () => {
    db.insert(fileObject)
      .values({
        id: "file-1",
        bucketId: "bucket-1",
        ownerId: "user-1",
        storageKey: "missing.txt",
        originalName: "missing.txt",
        mimeType: "text/plain",
        extension: ".txt",
        sizeBytes: 10,
      })
      .run()

    const result = await new R2ImportService(createStorage([])).syncBucket({ userId: "user-1" })
    const [file] = db.select().from(fileObject).all()

    expect(result.deleted).toBe(1)
    expect(file?.isDeleted).toBe(true)
    expect(file?.deletedAt).toBeTruthy()
  })

  it("keeps the sync-all compatibility wrapper pointed at the single bucket", async () => {
    const result = await syncAllR2Workspaces({
      storage: createStorage([{ key: "bucket/files/demo.txt", size: 128 }]),
      userId: "user-1",
      intervalMs: 0,
    })

    expect(result.workspaces).toBe(1)
    expect(result.synced).toBe(1)
    expect(result.imported).toBe(1)
  })

  it("skips managed upload storage keys instead of importing them as folders", async () => {
    const result = await new R2ImportService(
      createStorage([
        {
          key: "bucket/files/00000000-0000-4000-8000-000000000001/photo.jpg",
          size: 128,
        },
      ]),
    ).syncBucket({ userId: "user-1" })

    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(1)
    expect(db.select().from(fileObject).all()).toHaveLength(0)
    expect(db.select().from(folder).all()).toHaveLength(0)
  })

  it("does not trash existing uploaded files when their managed R2 object is present", async () => {
    db.insert(fileObject)
      .values({
        id: "file-1",
        bucketId: "bucket-1",
        ownerId: "user-1",
        storageKey: "bucket/files/00000000-0000-4000-8000-000000000001/photo.jpg",
        originalName: "photo.jpg",
        mimeType: "image/jpeg",
        extension: ".jpg",
        sizeBytes: 128,
      })
      .run()

    const result = await new R2ImportService(
      createStorage([
        {
          key: "bucket/files/00000000-0000-4000-8000-000000000001/photo.jpg",
          size: 128,
        },
      ]),
    ).syncBucket({ userId: "user-1" })

    const [file] = db.select().from(fileObject).all()
    expect(result.deleted).toBe(0)
    expect(file?.isDeleted).toBe(false)
  })

  it("cleans up previously imported managed upload keys and empty synthetic folders", async () => {
    db.insert(folder)
      .values([
        {
          id: "folder-bucket",
          name: "bucket",
          path: "/bucket",
          createdBy: "user-1",
        },
        {
          id: "folder-files",
          parentFolderId: "folder-bucket",
          name: "files",
          path: "/bucket/files",
          createdBy: "user-1",
        },
        {
          id: "folder-upload",
          parentFolderId: "folder-files",
          name: "00000000-0000-4000-8000-000000000001",
          path: "/bucket/files/00000000-0000-4000-8000-000000000001",
          createdBy: "user-1",
        },
      ])
      .run()
    db.insert(fileObject)
      .values({
        id: "file-imported",
        bucketId: "bucket-1",
        folderId: "folder-upload",
        ownerId: "user-1",
        storageKey: "bucket/files/00000000-0000-4000-8000-000000000001/photo.jpg",
        originalName: "photo.jpg",
        mimeType: "image/jpeg",
        extension: ".jpg",
        sizeBytes: 128,
        metadata: JSON.stringify({ importedFromR2: true }),
      })
      .run()

    const result = await new R2ImportService(createStorage([])).syncBucket({ userId: "user-1" })

    expect(result.deleted).toBe(1)
    expect(db.select().from(fileObject).all()).toHaveLength(0)
    expect(db.select().from(folder).all()).toHaveLength(0)
  })

  it("keeps synthetic parent folders when they contain legitimate content", async () => {
    db.insert(folder)
      .values([
        {
          id: "folder-bucket",
          name: "bucket",
          path: "/bucket",
          createdBy: "user-1",
        },
        {
          id: "folder-files",
          parentFolderId: "folder-bucket",
          name: "files",
          path: "/bucket/files",
          createdBy: "user-1",
        },
        {
          id: "folder-upload",
          parentFolderId: "folder-files",
          name: "00000000-0000-4000-8000-000000000001",
          path: "/bucket/files/00000000-0000-4000-8000-000000000001",
          createdBy: "user-1",
        },
        {
          id: "folder-legit",
          parentFolderId: "folder-bucket",
          name: "legit",
          path: "/bucket/legit",
          createdBy: "user-1",
        },
      ])
      .run()
    db.insert(fileObject)
      .values([
        {
          id: "file-imported",
          bucketId: "bucket-1",
          folderId: "folder-upload",
          ownerId: "user-1",
          storageKey: "bucket/files/00000000-0000-4000-8000-000000000001/photo.jpg",
          originalName: "photo.jpg",
          mimeType: "image/jpeg",
          extension: ".jpg",
          sizeBytes: 128,
          metadata: JSON.stringify({ importedFromR2: true }),
        },
        {
          id: "file-legit",
          bucketId: "bucket-1",
          folderId: "folder-legit",
          ownerId: "user-1",
          storageKey: "bucket/legit/readme.txt",
          originalName: "readme.txt",
          mimeType: "text/plain",
          extension: ".txt",
          sizeBytes: 10,
        },
      ])
      .run()

    await new R2ImportService(createStorage([{ key: "bucket/legit/readme.txt", size: 10 }]))
      .syncBucket({ userId: "user-1" })

    const paths = db
      .select()
      .from(folder)
      .all()
      .map((row) => row.path)

    expect(paths).toEqual(expect.arrayContaining(["/bucket", "/bucket/legit"]))
    expect(paths).not.toContain("/bucket/files")
  })
})
