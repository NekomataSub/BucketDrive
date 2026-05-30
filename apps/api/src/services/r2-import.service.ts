import { and, eq, isNull } from "drizzle-orm"
import { getDB } from "../lib/db"
import { auditLog, bucket, fileObject, folder, workspaceSettings } from "@bucketdrive/shared/db/schema"
import type { StorageProvider } from "./storage"

const DEFAULT_MIME_TYPE = "application/octet-stream"
const MAX_IMPORT_PAGES = 1000
const APP_FILES_PREFIX_PART = "files"
const THUMBNAILS_PREFIX_PART = "thumbnails"

export interface R2ImportResult {
  scanned: number
  imported: number
  updated: number
  deleted: number
  skipped: number
  failed: number
}

export class R2ImportService {
  constructor(private storage: StorageProvider) {}

  async syncWorkspace(params: {
    workspaceId: string
    userId: string
    prefix?: string
  }): Promise<R2ImportResult> {
    return this.importWorkspace(params)
  }

  async importWorkspace(params: {
    workspaceId: string
    userId: string
    prefix?: string
  }): Promise<R2ImportResult> {
    const db = getDB()
    const wsBucket = await db
      .select()
      .from(bucket)
      .where(eq(bucket.workspaceId, params.workspaceId))
      .get()

    if (!wsBucket) {
      throw new Error("No storage bucket found for workspace")
    }

    const now = new Date().toISOString()
    await this.updateSyncState(params.workspaceId, {
      r2SyncStatus: "syncing",
      r2SyncError: null,
      updatedAt: now,
    })

    const folderCache = new Map<string, string | null>([["", null]])
    const existingFiles = await db
      .select()
      .from(fileObject)
      .where(eq(fileObject.workspaceId, params.workspaceId))
      .all()
    const existingByKey = new Map(existingFiles.map((file) => [file.storageKey, file]))
    const seenKeys = new Set<string>()
    let cursor: string | undefined
    let pages = 0
    const result: R2ImportResult = {
      scanned: 0,
      imported: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
    }

    try {
      do {
        pages += 1
        if (pages > MAX_IMPORT_PAGES) {
          throw new Error("R2 import exceeded maximum page count")
        }

        const page = await this.storage.list({
          prefix: params.prefix,
          cursor,
          limit: 1000,
        })

        for (const object of page.objects) {
          result.scanned += 1

          if (!object.key || object.key.endsWith("/") || isInternalObjectKey(params.workspaceId, object.key)) {
            result.skipped += 1
            continue
          }

          seenKeys.add(object.key)

          try {
            const normalized = normalizeObjectKey(object.key, params.workspaceId)
            const mimeType = object.httpMetadata?.contentType ?? inferMimeType(normalized.fileName)
            const existing = existingByKey.get(object.key)

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
                .set({
                  mimeType,
                  extension: nextExtension,
                  sizeBytes: object.size,
                  updatedAt: now,
                })
                .where(eq(fileObject.id, existing.id))
                .run()

              result.updated += 1
              continue
            }

            if (!normalized.fileName) {
              result.skipped += 1
              continue
            }

            const folderId = await this.ensureFolderPath({
              workspaceId: params.workspaceId,
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
                workspaceId: params.workspaceId,
                bucketId: wsBucket.id,
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
                workspaceId: params.workspaceId,
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

        cursor = page.cursor
        if (!page.truncated) cursor = undefined
      } while (cursor)

      for (const file of existingFiles) {
        if (file.isDeleted || seenKeys.has(file.storageKey)) continue
        if (params.prefix && !file.storageKey.startsWith(params.prefix)) continue

        await db
          .update(fileObject)
          .set({
            isDeleted: true,
            deletedAt: now,
            updatedAt: now,
          })
          .where(eq(fileObject.id, file.id))
          .run()

        await db
          .insert(auditLog)
          .values({
            id: crypto.randomUUID(),
            workspaceId: params.workspaceId,
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

      await this.updateSyncState(params.workspaceId, {
        r2LastSyncAt: now,
        r2SyncStatus: "idle",
        r2SyncError: null,
        updatedAt: now,
      })

      return result
    } catch (err) {
      await this.updateSyncState(params.workspaceId, {
        r2SyncStatus: "failed",
        r2SyncError: err instanceof Error ? err.message : "R2 sync failed",
        updatedAt: now,
      })
      throw err
    }
  }

  private async ensureFolderPath(params: {
    workspaceId: string
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

      const conditions = [
        eq(folder.workspaceId, params.workspaceId),
        eq(folder.name, part),
        eq(folder.isDeleted, false),
      ]
      if (parentId === null) {
        conditions.push(isNull(folder.parentFolderId))
      } else {
        conditions.push(eq(folder.parentFolderId, parentId))
      }

      const existing = await db
        .select({ id: folder.id })
        .from(folder)
        .where(and(...conditions))
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
          workspaceId: params.workspaceId,
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

  private async updateSyncState(
    workspaceId: string,
    values: {
      r2LastSyncAt?: string
      r2SyncStatus: "idle" | "syncing" | "failed"
      r2SyncError: string | null
      updatedAt: string
    },
  ): Promise<void> {
    const db = getDB()
    await db
      .update(workspaceSettings)
      .set(values)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .run()
  }
}

function normalizeObjectKey(key: string, workspaceId: string): { folderParts: string[]; fileName: string } {
  const parts = key
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)

  if (
    parts[0] === "workspace" &&
    parts[1] === workspaceId &&
    parts[2] === APP_FILES_PREFIX_PART
  ) {
    return {
      folderParts: [],
      fileName: parts[parts.length - 1] ?? "",
    }
  }

  const fileName = parts.pop() ?? ""

  return {
    folderParts: parts,
    fileName,
  }
}

function isInternalObjectKey(workspaceId: string, key: string): boolean {
  return key.startsWith(`workspace/${workspaceId}/${THUMBNAILS_PREFIX_PART}/`)
}

function getExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf(".")
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return null
  return fileName.slice(dotIndex).toLowerCase()
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
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".webp": "image/webp",
    ".zip": "application/zip",
  }

  return mimeByExtension[extension] ?? DEFAULT_MIME_TYPE
}
