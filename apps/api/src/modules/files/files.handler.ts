import { Hono } from "hono"
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { getDB } from "../../lib/db"
import { ensureBucketSettings } from "../../lib/bucket"
import { isE2EAuthEnabled } from "../../lib/e2e-auth"
import {
  buildPublicObjectUrl,
  createStorageProvider,
  StorageProviderError,
} from "../../services/storage"
import { UploadError, UploadService } from "../../services/upload.service"
import { R2ImportService, syncR2BucketIfStale } from "../../services/r2-import.service"
import { ThumbnailService } from "../../services/thumbnail.service"
import { TrashService, TrashServiceError } from "../../services/trash.service"
import { hydrateFiles } from "./file-query"
import {
  auditLog,
  favorite,
  fileObject,
  fileObjectTag,
  fileTag,
  folder,
} from "@bucketdrive/shared/db/schema"
import {
  BatchUploadRequest,
  BatchUploadResponse,
  CompleteUploadRequest,
  DownloadUrlResponse,
  GetUploadPartSignedUrlRequest,
  ImportR2Request,
  ImportR2Response,
  InitiateUploadRequest,
  ListFilesRequest,
  ThumbnailUrlResponse,
  ToggleFavoriteResponse,
  UpdateFileRequest,
  UpdateFileTagsRequest,
  can,
} from "@bucketdrive/shared"
import type { WorkspaceRole } from "@bucketdrive/shared"

interface FilesEnv {
  STORAGE: R2Bucket
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  R2_BUCKET_NAME?: string
  E2E_TEST_AUTH?: string
  DB: D1Database
}

interface FilesVariables {
  user: { id: string; email: string; name: string; isPlatformAdmin?: boolean; role: WorkspaceRole }
  session: { id: string; userId: string; expiresAt: Date }
  bucketRole?: WorkspaceRole
}

const files = new Hono<{ Bindings: FilesEnv; Variables: FilesVariables }>()

files.use("*", authMiddleware)

files.get("/", requirePermission("files.read"), async (c) => {
  const query = ListFilesRequest.parse(c.req.query())
  const db = getDB()
  const user = c.get("user")

  c.executionCtx.waitUntil(syncR2IfStale({ env: c.env, userId: user.id }))

  const where = and(
    eq(fileObject.isDeleted, false),
    query.folderId ? eq(fileObject.folderId, query.folderId) : isNull(fileObject.folderId),
  )
  const direction = query.order === "desc" ? desc : asc
  const orderColumn =
    query.sort === "size"
      ? fileObject.sizeBytes
      : query.sort === "created_at"
        ? fileObject.createdAt
        : query.sort === "type"
          ? fileObject.extension
          : fileObject.originalName
  const offset = (query.page - 1) * query.limit

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(fileObject)
      .where(where)
      .orderBy(direction(orderColumn), asc(fileObject.originalName))
      .limit(query.limit)
      .offset(offset)
      .all(),
    db.select({ total: count() }).from(fileObject).where(where).get(),
  ])

  const total = totalRow?.total ?? 0
  return c.json({
    data: await hydrateFiles(db, user.id, rows),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  })
})

files.post("/upload", requirePermission("files.upload"), async (c) => {
  const user = c.get("user")
  const body = InitiateUploadRequest.parse(await c.req.json())
  const service = new UploadService(createStorageProvider(c.env))

  try {
    return c.json(
      await service.initiateUpload({
        userId: user.id,
        folderId: body.folderId,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        checksum: body.checksum,
      }),
      201,
    )
  } catch (err) {
    if (err instanceof UploadError) {
      return c.json({ code: err.code, message: err.message }, 400 as never)
    }
    throw err
  }
})

files.post("/upload/complete", requirePermission("files.upload"), async (c) => {
  const user = c.get("user")
  const body = CompleteUploadRequest.parse(await c.req.json())
  const service = new UploadService(createStorageProvider(c.env))

  try {
    const result = await service.completeUpload({
      userId: user.id,
      uploadId: body.uploadId,
      fileName: body.fileName,
      mimeType: body.mimeType,
      folderId: body.folderId,
      parts: body.parts,
    })

    if (result.storageKey && result.mimeType.startsWith("image/")) {
      c.executionCtx.waitUntil(
        new ThumbnailService({ storage: c.env.STORAGE }).generate({
          fileId: result.id,
          storageKey: result.storageKey,
          mimeType: result.mimeType,
        }),
      )
    }

    return c.json(result, 201)
  } catch (err) {
    if (err instanceof UploadError) {
      const statusMap: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, CONFLICT: 409 }
      return c.json({ code: err.code, message: err.message }, (statusMap[err.code] ?? 400) as never)
    }
    throw err
  }
})

files.post("/upload/direct", requirePermission("files.upload"), async (c) => {
  const storage = createStorageProvider(c.env)
  const uploadId = c.req.header("x-upload-id")
  const storageKey = c.req.header("x-storage-key")
  const mimeType = c.req.header("content-type") || "application/octet-stream"

  try {
    if (!uploadId || !storageKey) {
      return c.json(
        { code: "INVALID_REQUEST", message: "Missing uploadId or storageKey headers" },
        400 as never,
      )
    }

    const stream = c.req.raw.body
    if (!stream) {
      return c.json({ code: "INVALID_REQUEST", message: "Missing request body" }, 400 as never)
    }

    await storage.upload({
      key: storageKey,
      body: stream,
      contentType: mimeType,
    })

    return c.json({ success: true, uploadId, storageKey }, 201)
  } catch (err) {
    if (err instanceof UploadError) {
      return c.json({ code: err.code, message: err.message }, 400 as never)
    }
    throw err
  }
})

files.post("/batch-upload", requirePermission("files.upload"), async (c) => {
  const user = c.get("user")
  const body = BatchUploadRequest.parse(await c.req.json())
  const db = getDB()
  const service = new UploadService(createStorageProvider(c.env))

  const baseParentId = body.parentFolderId ?? null
  let basePath = ""
  if (baseParentId) {
    const parent = await db
      .select()
      .from(folder)
      .where(and(eq(folder.id, baseParentId), eq(folder.isDeleted, false)))
      .get()
    if (!parent)
      return c.json({ code: "PARENT_NOT_FOUND", message: "Parent folder not found" }, 404)
    basePath = parent.path
  }

  const folderPaths = new Set<string>(body.emptyFolders ?? [])
  for (const item of body.items) {
    const lastSlash = item.relativePath.lastIndexOf("/")
    const dir = lastSlash > 0 ? item.relativePath.slice(0, lastSlash) : ""
    if (dir) folderPaths.add(dir)
  }
  for (const dir of Array.from(folderPaths)) {
    const parts = dir.split("/")
    for (let index = 1; index < parts.length; index += 1) {
      folderPaths.add(parts.slice(0, index).join("/"))
    }
  }

  const folderMap = new Map<string, string>()
  const foldersCreated: Array<{ id: string; path: string }> = []
  const now = new Date().toISOString()
  const sortedPaths = Array.from(folderPaths).sort(
    (a, b) => a.split("/").length - b.split("/").length,
  )

  for (const path of sortedPaths) {
    const parts = path.split("/")
    const name = parts.at(-1)
    if (!name) continue
    const parentRelPath = parts.slice(0, -1).join("/") || null
    const parentId = parentRelPath ? (folderMap.get(parentRelPath) ?? null) : baseParentId
    const parentRow = parentId
      ? await db.select({ path: folder.path }).from(folder).where(eq(folder.id, parentId)).get()
      : null
    const parentPath = parentRow?.path ?? basePath

    const existing = await db
      .select()
      .from(folder)
      .where(
        and(
          eq(folder.name, name),
          eq(folder.isDeleted, false),
          parentId === null ? isNull(folder.parentFolderId) : eq(folder.parentFolderId, parentId),
        ),
      )
      .get()

    if (existing) {
      folderMap.set(path, existing.id)
      continue
    }

    const id = crypto.randomUUID()
    const newPath = parentPath ? `${parentPath}/${name}` : `/${name}`
    await db
      .insert(folder)
      .values({
        id,
        parentFolderId: parentId,
        name,
        path: newPath,
        createdBy: user.id,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    folderMap.set(path, id)
    foldersCreated.push({ id, path: newPath })
  }

  const items = []
  for (const item of body.items) {
    const lastSlash = item.relativePath.lastIndexOf("/")
    const dir = lastSlash > 0 ? item.relativePath.slice(0, lastSlash) : ""
    const folderId = dir ? (folderMap.get(dir) ?? null) : baseParentId
    const fileName = lastSlash >= 0 ? item.relativePath.slice(lastSlash + 1) : item.relativePath
    const initiated = await service.initiateUpload({
      userId: user.id,
      folderId,
      fileName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      checksum: item.checksum,
    })
    items.push({ clientId: item.clientId, fileId: crypto.randomUUID(), folderId, ...initiated })
  }

  return c.json(BatchUploadResponse.parse({ folders: foldersCreated, items }), 201)
})

files.post("/import-r2", requirePermission("bucket.settings.update"), async (c) => {
  const role = c.get("bucketRole") ?? c.get("user").role
  if (!c.get("user").isPlatformAdmin && role !== "owner" && role !== "admin") {
    return c.json({ code: "FORBIDDEN", message: "Only bucket admins can import R2 objects" }, 403)
  }

  const body = ImportR2Request.parse(await c.req.json().catch(() => ({})))
  const service = new R2ImportService(createStorageProvider(c.env))
  try {
    return c.json(
      ImportR2Response.parse(
        await service.importBucket({ userId: c.get("user").id, prefix: body.prefix }),
      ),
    )
  } catch (err) {
    if (err instanceof StorageProviderError) {
      return c.json({ code: err.code, message: err.message }, 400)
    }
    return c.json(
      {
        code: "R2_IMPORT_FAILED",
        message: err instanceof Error ? err.message : "Failed to import R2 objects",
      },
      400,
    )
  }
})

files.get("/uploads/:sessionId", requirePermission("files.upload"), async (c) => {
  const sessionId = c.req.param("sessionId")
  const service = new UploadService(createStorageProvider(c.env))
  try {
    return c.json(await service.getUploadSession(sessionId, { userId: c.get("user").id }))
  } catch (err) {
    if (err instanceof UploadError)
      return c.json({ code: err.code, message: err.message }, 404 as never)
    throw err
  }
})

files.post("/uploads/:sessionId/parts", requirePermission("files.upload"), async (c) => {
  const sessionId = c.req.param("sessionId")
  const body = GetUploadPartSignedUrlRequest.parse(await c.req.json())
  const service = new UploadService(createStorageProvider(c.env))
  try {
    return c.json(
      await service.generatePartSignedUrls(sessionId, body.partNumbers, {
        userId: c.get("user").id,
      }),
    )
  } catch (err) {
    if (err instanceof UploadError)
      return c.json({ code: err.code, message: err.message }, 400 as never)
    throw err
  }
})

files.delete("/uploads/:sessionId", requirePermission("files.upload"), async (c) => {
  const service = new UploadService(createStorageProvider(c.env))
  try {
    await service.cancelUpload(c.req.param("sessionId"), { userId: c.get("user").id })
    return c.json({ success: true, message: "Upload cancelled" })
  } catch (err) {
    if (err instanceof UploadError)
      return c.json({ code: err.code, message: err.message }, 400 as never)
    throw err
  }
})

files.get("/:fileId", requirePermission("files.read"), async (c) => {
  const db = getDB()
  const user = c.get("user")
  const file = await getActiveFile(c.req.param("fileId"))
  if (!file) return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  const [hydrated] = await hydrateFiles(db, user.id, [file])
  return c.json(hydrated ?? file)
})

files.get("/:fileId/preview", requirePermission("files.read"), async (c) => {
  const file = await getActiveFile(c.req.param("fileId"))
  if (!file) return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  const signedUrl = await createStorageProvider(c.env).generateSignedDownloadUrl(
    file.storageKey,
    300,
  )
  return c.json({
    signedUrl,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    fileName: file.originalName,
    mimeType: file.mimeType,
  })
})

files.get("/:fileId/download", requirePermission("files.read"), async (c) => {
  const file = await getActiveFile(c.req.param("fileId"))
  if (!file) return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  const settings = await ensureBucketSettings(getDB())
  const signedUrl = await createStorageProvider(c.env).generateSignedDownloadUrl(
    file.storageKey,
    900,
    { filename: file.originalName },
  )
  return c.json(
    DownloadUrlResponse.parse({
      signedUrl,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      fileName: file.originalName,
      publicUrl: buildPublicObjectUrl(settings.r2PublicBaseUrl, file.storageKey) ?? undefined,
    }),
  )
})

files.get("/:fileId/content", requirePermission("files.read"), async (c) => {
  const file = await getActiveFile(c.req.param("fileId"))
  if (!file) return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)

  const object = await createStorageProvider(c.env).getObject(file.storageKey)
  if (!object) return c.json({ code: "FILE_NOT_FOUND", message: "File content not found" }, 404)

  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType ?? file.mimeType,
      "Content-Length": String(object.size),
    },
  })
})

files.patch("/:fileId", requirePermission("files.rename"), async (c) => {
  const fileId = c.req.param("fileId")
  const user = c.get("user")
  const body = UpdateFileRequest.parse(await c.req.json())
  const db = getDB()
  const file = await getActiveFile(fileId)
  if (!file) return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)

  if (body.folderId !== undefined && body.folderId !== null) {
    const target = await db
      .select({ id: folder.id })
      .from(folder)
      .where(and(eq(folder.id, body.folderId), eq(folder.isDeleted, false)))
      .get()
    if (!target) return c.json({ code: "PARENT_NOT_FOUND", message: "Folder not found" }, 404)
  }

  const now = new Date().toISOString()
  const updateSet: Record<string, unknown> = { updatedAt: now }
  if (body.name !== undefined) {
    updateSet.originalName = body.name
    updateSet.extension = body.name.includes(".")
      ? (body.name.split(".").pop()?.toLowerCase() ?? null)
      : null
  }
  if (body.folderId !== undefined) updateSet.folderId = body.folderId
  await db.update(fileObject).set(updateSet).where(eq(fileObject.id, fileId)).run()

  if (
    (body.name !== undefined && body.name !== file.originalName) ||
    (body.folderId !== undefined && body.folderId !== file.folderId)
  ) {
    await db
      .insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        actorId: user.id,
        action:
          body.folderId !== undefined && body.folderId !== file.folderId
            ? "file.move"
            : "file.rename",
        resourceType: "file",
        resourceId: fileId,
        metadata: JSON.stringify({
          previousName: file.originalName,
          newName: body.name,
          previousFolderId: file.folderId,
          newFolderId: body.folderId,
        }),
        createdAt: now,
      })
      .run()
  }

  return c.json(await db.select().from(fileObject).where(eq(fileObject.id, fileId)).get())
})

files.post("/:fileId/favorite", requirePermission("files.favorite"), async (c) => {
  const fileId = c.req.param("fileId")
  const user = c.get("user")
  const db = getDB()
  const file = await getActiveFile(fileId)
  if (!file) return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  const existing = await db
    .select()
    .from(favorite)
    .where(and(eq(favorite.fileObjectId, fileId), eq(favorite.userId, user.id)))
    .get()
  const nextIsFavorited = !(existing?.isActive ?? false)
  if (existing) {
    await db
      .update(favorite)
      .set({ isActive: nextIsFavorited })
      .where(eq(favorite.id, existing.id))
      .run()
  } else {
    await db
      .insert(favorite)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        fileObjectId: fileId,
        isActive: true,
        createdAt: new Date().toISOString(),
      })
      .run()
  }
  return c.json(ToggleFavoriteResponse.parse({ fileId, isFavorited: nextIsFavorited }))
})

files.post("/:fileId/tags", requirePermission("files.tag"), async (c) => {
  const fileId = c.req.param("fileId")
  const body = UpdateFileTagsRequest.parse(await c.req.json())
  const db = getDB()
  const file = await getActiveFile(fileId)
  if (!file) return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  const uniqueTagIds = Array.from(new Set(body.tagIds))
  if (uniqueTagIds.length > 0) {
    const tags = await db
      .select({ id: fileTag.id })
      .from(fileTag)
      .where(inArray(fileTag.id, uniqueTagIds))
      .all()
    if (tags.length !== uniqueTagIds.length)
      return c.json({ code: "VALIDATION_ERROR", message: "One or more tags are invalid" }, 400)
  }
  await db.delete(fileObjectTag).where(eq(fileObjectTag.fileObjectId, fileId)).run()
  if (uniqueTagIds.length > 0) {
    await db
      .insert(fileObjectTag)
      .values(
        uniqueTagIds.map((tagId) => ({ id: crypto.randomUUID(), fileObjectId: fileId, tagId })),
      )
      .run()
  }
  const updated = await db.select().from(fileObject).where(eq(fileObject.id, fileId)).get()
  const [hydrated] = updated ? await hydrateFiles(db, c.get("user").id, [updated]) : []
  return c.json(hydrated ?? updated)
})

files.post("/:fileId/restore", requirePermission("files.restore"), async (c) => {
  try {
    return c.json(
      await new TrashService(getDB(), createStorageProvider(c.env)).restoreFile({
        fileId: c.req.param("fileId"),
        actorId: c.get("user").id,
      }),
    )
  } catch (err) {
    if (err instanceof TrashServiceError)
      return c.json({ code: err.code, message: err.message }, err.status as never)
    throw err
  }
})

files.delete("/:fileId/permanent", async (c) => {
  const role = c.get("user").role
  if (!can(role, "trash.permanent_delete")) {
    return c.json(
      { code: "FORBIDDEN", message: "Only owners and admins can permanently delete files" },
      403,
    )
  }
  try {
    return c.json(
      await new TrashService(getDB(), createStorageProvider(c.env)).permanentlyDeleteFile({
        fileId: c.req.param("fileId"),
        actorId: c.get("user").id,
      }),
    )
  } catch (err) {
    if (err instanceof TrashServiceError)
      return c.json({ code: err.code, message: err.message }, err.status as never)
    throw err
  }
})

files.get("/:fileId/thumbnail", requirePermission("files.read"), async (c) => {
  const file = await getActiveFile(c.req.param("fileId"))
  if (!file) return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  if (!file.thumbnailKey) {
    if (file.mimeType.startsWith("image/") && file.storageKey) {
      c.executionCtx.waitUntil(
        new ThumbnailService({ storage: c.env.STORAGE }).generate({
          fileId: file.id,
          storageKey: file.storageKey,
          mimeType: file.mimeType,
        }),
      )
    }
    return c.json({ code: "THUMBNAIL_NOT_FOUND", message: "Thumbnail not yet generated" }, 404)
  }
  return c.json(
    ThumbnailUrlResponse.parse({
      signedUrl: await createStorageProvider(c.env).generateSignedDownloadUrl(
        file.thumbnailKey,
        300,
      ),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }),
  )
})

files.post("/:fileId/thumbnail", requirePermission("files.upload"), async (c) => {
  const file = await getActiveFile(c.req.param("fileId"))
  if (!file) return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  const blob = await c.req.blob()
  if (blob.size === 0)
    return c.json({ code: "VALIDATION_ERROR", message: "Thumbnail blob is required" }, 400)
  await new ThumbnailService({ storage: c.env.STORAGE }).uploadVideoFrame({ fileId: file.id, blob })
  return c.json({ success: true })
})

files.delete("/:fileId", requirePermission("files.delete"), async (c) => {
  try {
    return c.json(
      await new TrashService(getDB(), createStorageProvider(c.env)).softDeleteFile({
        fileId: c.req.param("fileId"),
        actorId: c.get("user").id,
      }),
    )
  } catch (err) {
    if (err instanceof TrashServiceError)
      return c.json({ code: err.code, message: err.message }, err.status as never)
    throw err
  }
})

async function getActiveFile(fileId: string) {
  return getDB()
    .select()
    .from(fileObject)
    .where(and(eq(fileObject.id, fileId), eq(fileObject.isDeleted, false)))
    .get()
}

async function syncR2IfStale(params: { env: FilesEnv; userId: string }): Promise<void> {
  if (isE2EAuthEnabled(params.env)) return
  try {
    await syncR2BucketIfStale({ storage: createStorageProvider(params.env), userId: params.userId })
  } catch (err) {
    console.warn("Automatic R2 sync failed:", err)
  }
}

export const filesHandler = files
