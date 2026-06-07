import { and, eq, inArray, isNull } from "drizzle-orm"
import {
  auditLog,
  bucketSettings,
  favorite,
  fileObject,
  fileObjectTag,
  folder,
} from "@bucketdrive/shared/db/schema"
import { getDB } from "../lib/db"
import { ensureBucketSettings, getOrCreateDefaultBucket } from "../lib/bucket"
import type { StorageProvider } from "./storage"

const DEFAULT_MIME_TYPE = "application/octet-stream"
const MAX_IMPORT_PAGES = 1000
const THUMBNAILS_PREFIX_PART = "thumbnails"
const MANAGED_UPLOAD_KEY_PATTERN =
  /^bucket\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\//i
export const AUTO_R2_SYNC_INTERVAL_MS = 30_000
export const SYSTEM_R2_SYNC_ACTOR_ID = "system"

export interface R2ImportResult {
  scanned: number
  imported: number
  updated: number
  deleted: number
  skipped: number
  failed: number
}

export interface R2SyncAllWorkspacesResult extends R2ImportResult {
  workspaces: number
  synced: number
  skippedWorkspaces: number
  failedWorkspaces: number
}

export async function syncR2BucketIfStale(params: {
  storage: StorageProvider
  userId: string
  prefix?: string
  intervalMs?: number
}): Promise<R2ImportResult | null> {
  const db = getDB()
  const settings = await ensureBucketSettings(db)
  const intervalMs = params.intervalMs ?? AUTO_R2_SYNC_INTERVAL_MS
  const now = Date.now()
  const lastAttemptAt = settings.updatedAt ? Date.parse(settings.updatedAt) : NaN

  if (
    (settings.r2SyncStatus === "syncing" || settings.r2SyncStatus === "failed") &&
    Number.isFinite(lastAttemptAt) &&
    now - lastAttemptAt < intervalMs
  ) {
    return null
  }

  if (settings.r2LastSyncAt) {
    const lastSyncAt = Date.parse(settings.r2LastSyncAt)
    if (Number.isFinite(lastSyncAt) && now - lastSyncAt < intervalMs) return null
  }

  return new R2ImportService(params.storage).syncBucket({
    userId: params.userId,
    prefix: params.prefix,
  })
}

export async function syncAllR2Workspaces(params: {
  storage: StorageProvider
  userId?: string
  intervalMs?: number
}): Promise<R2SyncAllWorkspacesResult> {
  const syncResult = await syncR2BucketIfStale({
    storage: params.storage,
    userId: params.userId ?? SYSTEM_R2_SYNC_ACTOR_ID,
    prefix: "bucket/files/",
    intervalMs: params.intervalMs,
  })

  return {
    workspaces: 1,
    synced: syncResult ? 1 : 0,
    scanned: syncResult?.scanned ?? 0,
    imported: syncResult?.imported ?? 0,
    updated: syncResult?.updated ?? 0,
    deleted: syncResult?.deleted ?? 0,
    skipped: syncResult?.skipped ?? 0,
    skippedWorkspaces: syncResult ? 0 : 1,
    failed: syncResult?.failed ?? 0,
    failedWorkspaces: 0,
  }
}

export class R2ImportService {
  constructor(private storage: StorageProvider) {}

  async syncBucket(params: { userId: string; prefix?: string }): Promise<R2ImportResult> {
    return this.importBucket(params)
  }

  async importBucket(params: { userId: string; prefix?: string }): Promise<R2ImportResult> {
    const db = getDB()
    const defaultBucket = await getOrCreateDefaultBucket(db)
    const settings = await ensureBucketSettings(db)
    const now = new Date().toISOString()

    await this.updateSyncState(settings.id, {
      r2SyncStatus: "syncing",
      r2SyncError: null,
      updatedAt: now,
    })

    const folderCache = new Map<string, string | null>([["", null]])
    const seenKeys = new Set<string>()
    const result: R2ImportResult = {
      scanned: 0,
      imported: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
    }
    let cursor: string | undefined
    let pages = 0

    try {
      result.deleted += await this.cleanupManagedUploadImports({ userId: params.userId, now })
      const existingFiles = await db.select().from(fileObject).all()
      const existingByKey = new Map(existingFiles.map((file) => [file.storageKey, file]))

      do {
        pages += 1
        if (pages > MAX_IMPORT_PAGES) throw new Error("R2 import exceeded maximum page count")

        const page = await this.storage.list({ prefix: params.prefix, cursor, limit: 1000 })

        for (const object of page.objects) {
          result.scanned += 1
          if (!object.key || object.key.endsWith("/") || isInternalObjectKey(object.key)) {
            result.skipped += 1
            continue
          }

          const existing = existingByKey.get(object.key)
          if (isManagedUploadObjectKey(object.key)) {
            if (existing && !isImportedFromR2(existing.metadata)) seenKeys.add(object.key)
            result.skipped += 1
            continue
          }

          seenKeys.add(object.key)
          try {
            const normalized = normalizeObjectKey(object.key)
            if (!normalized.fileName) {
              result.skipped += 1
              continue
            }

            const mimeType = getObjectMimeType(
              object.httpMetadata?.contentType,
              normalized.fileName,
            )

            if (existing) {
              if (existing.isDeleted) {
                result.skipped += 1
                continue
              }
              const nextExtension = getExtension(existing.originalName)
              const hasChanges =
                existing.sizeBytes !== object.size ||
                existing.mimeType !== mimeType ||
                existing.extension !== nextExtension

              if (!hasChanges) {
                result.skipped += 1
                continue
              }

              await db
                .update(fileObject)
                .set({ mimeType, extension: nextExtension, sizeBytes: object.size, updatedAt: now })
                .where(eq(fileObject.id, existing.id))
                .run()
              result.updated += 1
              continue
            }

            const folderId = await this.ensureFolderPath({
              userId: params.userId,
              pathParts: normalized.folderParts,
              cache: folderCache,
              now,
            })
            const fileId = crypto.randomUUID()
            await db
              .insert(fileObject)
              .values({
                id: fileId,
                bucketId: defaultBucket.id,
                folderId,
                ownerId: params.userId,
                storageKey: object.key,
                originalName: normalized.fileName,
                mimeType,
                extension: getExtension(normalized.fileName),
                sizeBytes: object.size,
                checksum: null,
                thumbnailKey: null,
                metadata: JSON.stringify({ importedFromR2: true }),
                isDeleted: false,
                deletedAt: null,
                createdAt: object.uploaded?.toISOString() ?? now,
                updatedAt: now,
              })
              .run()

            await db
              .insert(auditLog)
              .values({
                id: crypto.randomUUID(),
                actorId: params.userId,
                action: "file.import_r2",
                resourceType: "file",
                resourceId: fileId,
                metadata: JSON.stringify({ storageKey: object.key }),
                createdAt: now,
              })
              .run()
            result.imported += 1
          } catch {
            result.failed += 1
          }
        }

        cursor = page.truncated ? page.cursor : undefined
      } while (cursor)

      for (const file of existingFiles) {
        if (file.isDeleted || seenKeys.has(file.storageKey)) continue
        if (params.prefix && !file.storageKey.startsWith(params.prefix)) continue
        await db
          .update(fileObject)
          .set({ isDeleted: true, deletedAt: now, updatedAt: now })
          .where(eq(fileObject.id, file.id))
          .run()
        await db
          .insert(auditLog)
          .values({
            id: crypto.randomUUID(),
            actorId: params.userId,
            action: "file.r2_missing_trash",
            resourceType: "file",
            resourceId: file.id,
            metadata: JSON.stringify({ storageKey: file.storageKey }),
            createdAt: now,
          })
          .run()
        result.deleted += 1
      }

      await this.updateSyncState(settings.id, {
        r2LastSyncAt: now,
        r2SyncStatus: "idle",
        r2SyncError: null,
        updatedAt: now,
      })
      return result
    } catch (err) {
      await this.updateSyncState(settings.id, {
        r2SyncStatus: "failed",
        r2SyncError: err instanceof Error ? err.message : "R2 sync failed",
        updatedAt: now,
      })
      throw err
    }
  }

  private async ensureFolderPath(params: {
    userId: string
    pathParts: string[]
    cache: Map<string, string | null>
    now: string
  }): Promise<string | null> {
    const db = getDB()
    let parentId: string | null = null
    let parentPath = ""

    for (const part of params.pathParts) {
      const cacheKey = parentPath ? `${parentPath}/${part}` : part
      if (params.cache.has(cacheKey)) {
        parentId = params.cache.get(cacheKey) ?? null
        parentPath = cacheKey
        continue
      }

      const existing = await db
        .select({ id: folder.id })
        .from(folder)
        .where(
          and(
            eq(folder.name, part),
            eq(folder.isDeleted, false),
            parentId === null ? isNull(folder.parentFolderId) : eq(folder.parentFolderId, parentId),
          ),
        )
        .get()

      if (existing) {
        parentId = existing.id
        parentPath = cacheKey
        params.cache.set(cacheKey, parentId)
        continue
      }

      const newId = crypto.randomUUID()
      await db
        .insert(folder)
        .values({
          id: newId,
          parentFolderId: parentId,
          name: part,
          path: `/${cacheKey}`,
          createdBy: params.userId,
          isDeleted: false,
          deletedAt: null,
          createdAt: params.now,
          updatedAt: params.now,
        })
        .run()
      parentId = newId
      parentPath = cacheKey
      params.cache.set(cacheKey, parentId)
    }

    return parentId
  }

  private async cleanupManagedUploadImports(params: {
    userId: string
    now: string
  }): Promise<number> {
    const db = getDB()
    const importedManagedFiles = (await db.select().from(fileObject).all()).filter(
      (file) => isManagedUploadObjectKey(file.storageKey) && isImportedFromR2(file.metadata),
    )

    if (importedManagedFiles.length === 0) return 0

    const fileIds = importedManagedFiles.map((file) => file.id)
    const candidateFolderIds = new Set(
      importedManagedFiles
        .map((file) => file.folderId)
        .filter((folderId): folderId is string => Boolean(folderId)),
    )

    await db.delete(fileObjectTag).where(inArray(fileObjectTag.fileObjectId, fileIds)).run()
    await db.delete(favorite).where(inArray(favorite.fileObjectId, fileIds)).run()
    await db.delete(fileObject).where(inArray(fileObject.id, fileIds)).run()

    for (const file of importedManagedFiles) {
      await db
        .insert(auditLog)
        .values({
          id: crypto.randomUUID(),
          actorId: params.userId,
          action: "file.r2_internal_import_cleanup",
          resourceType: "file",
          resourceId: file.id,
          metadata: JSON.stringify({ storageKey: file.storageKey }),
          createdAt: params.now,
        })
        .run()
    }

    await this.cleanupEmptyManagedImportFolders(candidateFolderIds)
    return importedManagedFiles.length
  }

  private async cleanupEmptyManagedImportFolders(initialFolderIds: Set<string>): Promise<void> {
    const db = getDB()
    const allFolders = await db.select().from(folder).where(eq(folder.isDeleted, false)).all()
    const foldersById = new Map(allFolders.map((row) => [row.id, row]))
    const candidateIds = new Set<string>()

    for (const folderId of initialFolderIds) {
      let current = foldersById.get(folderId)
      while (current && isManagedImportFolderPath(current.path)) {
        candidateIds.add(current.id)
        current = current.parentFolderId ? foldersById.get(current.parentFolderId) : undefined
      }
    }

    const sortedCandidates = [...candidateIds]
      .map((id) => foldersById.get(id))
      .filter((row): row is (typeof allFolders)[number] => Boolean(row))
      .sort((a, b) => b.path.split("/").length - a.path.split("/").length)

    for (const candidate of sortedCandidates) {
      const hasFiles = Boolean(
        await db
          .select({ id: fileObject.id })
          .from(fileObject)
          .where(and(eq(fileObject.folderId, candidate.id), eq(fileObject.isDeleted, false)))
          .get(),
      )
      if (hasFiles) continue

      const hasChildren = Boolean(
        await db
          .select({ id: folder.id })
          .from(folder)
          .where(and(eq(folder.parentFolderId, candidate.id), eq(folder.isDeleted, false)))
          .get(),
      )
      if (hasChildren) continue

      await db.delete(folder).where(eq(folder.id, candidate.id)).run()
    }
  }

  private async updateSyncState(
    settingsId: string,
    values: {
      r2LastSyncAt?: string
      r2SyncStatus: "idle" | "syncing" | "failed"
      r2SyncError: string | null
      updatedAt: string
    },
  ): Promise<void> {
    await getDB().update(bucketSettings).set(values).where(eq(bucketSettings.id, settingsId)).run()
  }
}

function normalizeObjectKey(key: string): { folderParts: string[]; fileName: string } {
  const parts = key
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
  const fileName = parts.pop() ?? ""
  return { folderParts: parts, fileName }
}

function isInternalObjectKey(key: string): boolean {
  return key.includes(`/${THUMBNAILS_PREFIX_PART}/`) || key.startsWith(`${THUMBNAILS_PREFIX_PART}/`)
}

function isManagedUploadObjectKey(key: string): boolean {
  return MANAGED_UPLOAD_KEY_PATTERN.test(key)
}

function isManagedImportFolderPath(path: string): boolean {
  return path === "/bucket" || path === "/bucket/files" || path.startsWith("/bucket/files/")
}

function isImportedFromR2(metadata: string | null): boolean {
  if (!metadata) return false
  try {
    const parsed = JSON.parse(metadata) as { importedFromR2?: unknown }
    return parsed.importedFromR2 === true
  } catch {
    return false
  }
}

function getExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf(".")
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return null
  return fileName.slice(dotIndex).toLowerCase()
}

function getObjectMimeType(contentType: string | undefined, fileName: string): string {
  if (!contentType || contentType === DEFAULT_MIME_TYPE) return inferMimeType(fileName)
  return contentType
}

function inferMimeType(fileName: string): string {
  const extension = getExtension(fileName)
  if (!extension) return DEFAULT_MIME_TYPE
  const mimeByExtension: Record<string, string> = {
    ".avif": "image/avif",
    ".css": "text/css",
    ".csv": "text/csv",
    ".gif": "image/gif",
    ".html": "text/html",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript",
    ".json": "application/json",
    ".md": "text/markdown",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".webp": "image/webp",
    ".zip": "application/zip",
  }
  return mimeByExtension[extension] ?? DEFAULT_MIME_TYPE
}
