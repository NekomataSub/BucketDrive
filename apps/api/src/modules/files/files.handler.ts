import { Hono } from "hono"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { buildPublicObjectUrl, createStorageProvider, StorageProviderError } from "../../services/storage"
import { UploadService, UploadError } from "../../services/upload.service"
import { R2ImportService } from "../../services/r2-import.service"
import { ThumbnailService } from "../../services/thumbnail.service"
import { TrashService, TrashServiceError, getWorkspaceRole } from "../../services/trash.service"
import { getDB } from "../../lib/db"
import { hydrateFiles } from "./file-query"
import { auditLog, favorite, fileObject, fileObjectTag, fileTag, folder, workspaceSettings } from "@bucketdrive/shared/db/schema"
import { and, eq, inArray, isNull } from "drizzle-orm"
import {
  InitiateUploadRequest,
  CompleteUploadRequest,
  ListFilesRequest,
  ToggleFavoriteResponse,
  UpdateFileRequest,
  UpdateFileTagsRequest,
  GetUploadPartSignedUrlRequest,
  BatchUploadRequest,
  BatchUploadResponse,
  ImportR2Request,
  ImportR2Response,
  DownloadUrlResponse,
  ThumbnailUrlResponse,
  can,
} from "@bucketdrive/shared"
import type { WorkspaceRole } from "@bucketdrive/shared"

const AUTO_R2_SYNC_INTERVAL_MS = 30_000

interface FilesEnv {
  STORAGE: R2Bucket
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  R2_BUCKET_NAME?: string
  DB: D1Database
}

interface FilesVariables {
  user: { id: string; email: string; name: string; isPlatformAdmin?: boolean }
  session: { id: string; userId: string; expiresAt: Date }
  workspaceRole?: WorkspaceRole
}

const files = new Hono<{ Bindings: FilesEnv; Variables: FilesVariables }>()

files.use("*", authMiddleware)

files.get("/", requirePermission("files.read"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const query = ListFilesRequest.parse(c.req.query())
  const db = getDB()
  const user = c.get("user")

  await syncR2IfStale({
    env: c.env,
    workspaceId,
    userId: user.id,
  })

  const rows = await db
    .select()
    .from(fileObject)
    .where(
      and(
        eq(fileObject.workspaceId, workspaceId),
        eq(fileObject.isDeleted, false),
      ),
    )
    .all()

  const filtered = query.folderId
    ? rows.filter((f) => f.folderId === query.folderId)
    : rows

  const sorted = [...filtered].sort((a, b) => {
    const dir = query.order === "desc" ? -1 : 1
    switch (query.sort) {
      case "size":
        return (a.sizeBytes - b.sizeBytes) * dir
      case "created_at":
        return a.createdAt.localeCompare(b.createdAt) * dir
      case "type":
        return (a.extension ?? "").localeCompare(b.extension ?? "") * dir
      default:
        return a.originalName.localeCompare(b.originalName) * dir
    }
  })

  const page = query.page
  const limit = query.limit
  const start = (page - 1) * limit
  const paged = await hydrateFiles(db, workspaceId, user.id, sorted.slice(start, start + limit))

  return c.json({
    data: paged,
    meta: {
      page,
      limit,
      total: sorted.length,
      totalPages: Math.ceil(sorted.length / limit),
    },
  })
})

files.post("/upload", requirePermission("files.upload"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const user = c.get("user")
  const body = InitiateUploadRequest.parse(await c.req.json())

  const storage = createStorageProvider(c.env)
  const service = new UploadService(storage)

  try {
    const result = await service.initiateUpload({
      workspaceId,
      userId: user.id,
      folderId: body.folderId,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      checksum: body.checksum,
    })

    return c.json(result, 201)
  } catch (err) {
    if (err instanceof UploadError) {
      return c.json({ code: err.code, message: err.message }, 400 as never)
    }
    throw err
  }
})

files.post("/upload/complete", requirePermission("files.upload"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const user = c.get("user")
  const body = CompleteUploadRequest.parse(await c.req.json())

  const storage = createStorageProvider(c.env)
  const service = new UploadService(storage)

  try {
    const result = await service.completeUpload({
      workspaceId,
      userId: user.id,
      uploadId: body.uploadId,
      fileName: body.fileName,
      mimeType: body.mimeType,
      folderId: body.folderId,
      parts: body.parts,
    })

    if (result.storageKey && result.mimeType.startsWith("image/")) {
      const thumbnailService = new ThumbnailService({ storage: c.env.STORAGE })
      c.executionCtx.waitUntil(
        thumbnailService.generate({
          fileId: result.id,
          workspaceId,
          storageKey: result.storageKey,
          mimeType: result.mimeType,
        }),
      )
    }

    return c.json(result, 201)
  } catch (err) {
    if (err instanceof UploadError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        FORBIDDEN: 403,
        CONFLICT: 409,
      }
      const status = statusMap[err.code] ?? 400
      return c.json({ code: err.code, message: err.message }, status as never)
    }
    throw err
  }
})

files.post("/batch-upload", requirePermission("files.upload"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const user = c.get("user")
  const body = BatchUploadRequest.parse(await c.req.json())
  const db = getDB()
  const storage = createStorageProvider(c.env)
  const service = new UploadService(storage)

  // Resolve base parent folder
  const baseParentId: string | null = body.parentFolderId ?? null
  let basePath = ""
  if (baseParentId) {
    const parent = await db
      .select()
      .from(folder)
      .where(and(eq(folder.id, baseParentId), eq(folder.workspaceId, workspaceId)))
      .get()
    if (!parent || parent.isDeleted) {
      return c.json({ code: "PARENT_NOT_FOUND", message: "Parent folder not found" }, 404)
    }
    basePath = parent.path
  }

  // Collect all folder paths needed
  const folderPaths = new Set<string>()
  const emptyFolderPaths = new Set<string>(body.emptyFolders ?? [])

  for (const item of body.items) {
    const lastSlash = item.relativePath.lastIndexOf("/")
    const dir = lastSlash > 0 ? item.relativePath.slice(0, lastSlash) : ""
    if (dir) folderPaths.add(dir)
  }

  for (const dir of emptyFolderPaths) {
    folderPaths.add(dir)
    const parts = dir.split("/")
    for (let i = 1; i < parts.length; i++) {
      folderPaths.add(parts.slice(0, i).join("/"))
    }
  }

  for (const dir of Array.from(folderPaths)) {
    const parts = dir.split("/")
    for (let i = 1; i < parts.length; i++) {
      folderPaths.add(parts.slice(0, i).join("/"))
    }
  }

  const sortedPaths = Array.from(folderPaths).sort(
    (a, b) => a.split("/").length - b.split("/").length,
  )

  const folderMap = new Map<string, string>()
  const foldersCreated: Array<{ id: string; path: string }> = []
  const now = new Date().toISOString()

  for (const path of sortedPaths) {
    const parts = path.split("/")
    const name = parts[parts.length - 1]
    if (!name) continue
    const parentRelPath = parts.slice(0, -1).join("/") || null

    let parentId: string | null
    let parentPathStr: string

    if (parentRelPath) {
      parentId = folderMap.get(parentRelPath) ?? null
      const parentRow = parentId
        ? await db.select({ path: folder.path }).from(folder).where(eq(folder.id, parentId)).get()
        : null
      parentPathStr = parentRow?.path ?? ""
    } else {
      parentId = baseParentId
      parentPathStr = basePath
    }

    const existingConditions = [
      eq(folder.workspaceId, workspaceId),
      eq(folder.name, name),
      eq(folder.isDeleted, false),
    ]
    if (parentId === null) {
      existingConditions.push(isNull(folder.parentFolderId))
    } else {
      existingConditions.push(eq(folder.parentFolderId, parentId))
    }

    const existing = await db
      .select()
      .from(folder)
      .where(and(...existingConditions))
      .get()

    if (existing) {
      folderMap.set(path, existing.id)
      continue
    }

    const newId = crypto.randomUUID()
    const newPath = parentPathStr ? `${parentPathStr}/${name}` : `/${name}`

    await db
      .insert(folder)
      .values({
        id: newId,
        workspaceId,
        parentFolderId: parentId,
        name,
        path: newPath,
        createdBy: user.id,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    folderMap.set(path, newId)
    foldersCreated.push({ id: newId, path: newPath })
  }

  // Create empty folders that were only in emptyFolders and not created yet
  for (const dir of emptyFolderPaths) {
    if (!folderMap.has(dir)) {
      const parts = dir.split("/")
      const name = parts[parts.length - 1]
      if (!name) continue
      const parentRelPath = parts.slice(0, -1).join("/") || null

      let parentId: string | null
      let parentPathStr: string

      if (parentRelPath) {
        parentId = folderMap.get(parentRelPath) ?? null
        const parentRow = parentId
          ? await db.select({ path: folder.path }).from(folder).where(eq(folder.id, parentId)).get()
          : null
        parentPathStr = parentRow?.path ?? ""
      } else {
        parentId = baseParentId
        parentPathStr = basePath
      }

      const newId = crypto.randomUUID()
      const newPath = parentPathStr ? `${parentPathStr}/${name}` : `/${name}`

      await db
        .insert(folder)
        .values({
          id: newId,
          workspaceId,
          parentFolderId: parentId,
          name,
          path: newPath,
          createdBy: user.id,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      folderMap.set(dir, newId)
      foldersCreated.push({ id: newId, path: newPath })
    }
  }

  const results: Array<{
    clientId: string
    fileId: string
    folderId: string | null
    uploadId: string
    sessionId?: string
    signedUrl?: string
    expiresAt: string
    storageKey: string
    partSize?: number
    totalParts?: number
  }> = []

  for (const item of body.items) {
    const lastSlash = item.relativePath.lastIndexOf("/")
    const dir = lastSlash > 0 ? item.relativePath.slice(0, lastSlash) : ""
    const folderId = dir ? (folderMap.get(dir) ?? null) : baseParentId
    const fileName = lastSlash >= 0 ? item.relativePath.slice(lastSlash + 1) : item.relativePath

    try {
      const initiate = await service.initiateUpload({
        workspaceId,
        userId: user.id,
        folderId,
        fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        checksum: item.checksum,
      })

      results.push({
        clientId: item.clientId,
        fileId: crypto.randomUUID(),
        folderId,
        uploadId: initiate.uploadId,
        sessionId: initiate.sessionId,
        signedUrl: initiate.signedUrl,
        expiresAt: initiate.expiresAt,
        storageKey: initiate.storageKey,
        partSize: initiate.partSize,
        totalParts: initiate.totalParts,
      })
    } catch (err) {
      if (err instanceof UploadError) {
        return c.json({ code: err.code, message: err.message }, 400 as never)
      }
      throw err
    }
  }

  return c.json(
    BatchUploadResponse.parse({
      folders: foldersCreated,
      items: results,
    }),
    201,
  )
})

files.post("/import-r2", requirePermission("workspace.settings.update"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const role = c.get("workspaceRole")
  const user = c.get("user")
  if (!user.isPlatformAdmin && role !== "owner" && role !== "admin") {
    return c.json({ code: "FORBIDDEN", message: "Only workspace admins can import R2 objects" }, 403)
  }

  const body = ImportR2Request.parse(await c.req.json().catch(() => ({})))
  const storage = createStorageProvider(c.env)
  const service = new R2ImportService(storage)

  try {
    const result = await service.importWorkspace({
      workspaceId,
      userId: user.id,
      prefix: body.prefix,
    })

    return c.json(ImportR2Response.parse(result))
  } catch (err) {
    if (err instanceof StorageProviderError) {
      return c.json({
        code: err.code,
        message: err.message,
      }, 400)
    }
    return c.json({
      code: "R2_IMPORT_FAILED",
      message: err instanceof Error ? err.message : "Failed to import R2 objects",
    }, 400)
  }
})

files.get("/uploads/:sessionId", requirePermission("files.upload"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const sessionId = c.req.param("sessionId")

  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }
  if (!sessionId) {
    return c.json({ code: "VALIDATION_ERROR", message: "sessionId is required" }, 400)
  }

  const user = c.get("user")
  const storage = createStorageProvider(c.env)
  const service = new UploadService(storage)

  try {
    const result = await service.getUploadSession(sessionId, {
      workspaceId,
      userId: user.id,
    })
    return c.json(result)
  } catch (err) {
    if (err instanceof UploadError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        FORBIDDEN: 403,
      }
      const status = statusMap[err.code] ?? 400
      return c.json({ code: err.code, message: err.message }, status as never)
    }
    throw err
  }
})

files.post("/uploads/:sessionId/parts", requirePermission("files.upload"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const sessionId = c.req.param("sessionId")

  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }
  if (!sessionId) {
    return c.json({ code: "VALIDATION_ERROR", message: "sessionId is required" }, 400)
  }

  const user = c.get("user")
  const body = GetUploadPartSignedUrlRequest.parse(await c.req.json())
  const storage = createStorageProvider(c.env)
  const service = new UploadService(storage)

  try {
    const result = await service.generatePartSignedUrls(sessionId, body.partNumbers, {
      workspaceId,
      userId: user.id,
    })
    return c.json(result)
  } catch (err) {
    if (err instanceof UploadError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        FORBIDDEN: 403,
        CONFLICT: 409,
      }
      const status = statusMap[err.code] ?? 400
      return c.json({ code: err.code, message: err.message }, status as never)
    }
    throw err
  }
})

files.delete("/uploads/:sessionId", requirePermission("files.upload"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const sessionId = c.req.param("sessionId")

  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }
  if (!sessionId) {
    return c.json({ code: "VALIDATION_ERROR", message: "sessionId is required" }, 400)
  }

  const user = c.get("user")
  const storage = createStorageProvider(c.env)
  const service = new UploadService(storage)

  try {
    await service.cancelUpload(sessionId, {
      workspaceId,
      userId: user.id,
    })
    return c.json({ success: true, message: "Upload cancelled" })
  } catch (err) {
    if (err instanceof UploadError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        FORBIDDEN: 403,
        CONFLICT: 409,
      }
      const status = statusMap[err.code] ?? 400
      return c.json({ code: err.code, message: err.message }, status as never)
    }
    throw err
  }
})

files.get("/:fileId", requirePermission("files.read"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const fileId = c.req.param("fileId")
  const db = getDB()
  const user = c.get("user")

  if (!workspaceId || !fileId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and fileId are required" }, 400)
  }

  const file = await db
    .select()
    .from(fileObject)
    .where(and(eq(fileObject.id, fileId), eq(fileObject.workspaceId, workspaceId)))
    .get()

  if (!file) {
    return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  }

  const [hydrated] = await hydrateFiles(db, workspaceId, user.id, [file])
  return c.json(hydrated ?? file)
})

files.get("/:fileId/preview", requirePermission("files.read"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const fileId = c.req.param("fileId")
  const db = getDB()

  if (!workspaceId || !fileId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and fileId are required" }, 400)
  }

  const file = await db
    .select()
    .from(fileObject)
    .where(and(eq(fileObject.id, fileId), eq(fileObject.workspaceId, workspaceId)))
    .get()

  if (!file || file.isDeleted) {
    return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  }

  const storage = createStorageProvider(c.env)
  const signedUrl = await storage.generateSignedDownloadUrl(file.storageKey, 300)
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  return c.json({
    signedUrl,
    expiresAt,
    fileName: file.originalName,
    mimeType: file.mimeType,
  })
})

files.get("/:fileId/download", requirePermission("files.read"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const fileId = c.req.param("fileId")
  const db = getDB()

  if (!workspaceId || !fileId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and fileId are required" }, 400)
  }

  const file = await db
    .select()
    .from(fileObject)
    .where(and(eq(fileObject.id, fileId), eq(fileObject.workspaceId, workspaceId)))
    .get()

  if (!file || file.isDeleted) {
    return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  }

  const storage = createStorageProvider(c.env)
  const signedUrl = await storage.generateSignedDownloadUrl(file.storageKey, 900, {
    filename: file.originalName,
  })
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const settings = await db
    .select({ r2PublicBaseUrl: workspaceSettings.r2PublicBaseUrl })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .get()

  return c.json(DownloadUrlResponse.parse({
    signedUrl,
    expiresAt,
    fileName: file.originalName,
    publicUrl: buildPublicObjectUrl(settings?.r2PublicBaseUrl, file.storageKey) ?? undefined,
  }))
})

files.patch("/:fileId", requirePermission("files.rename"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const fileId = c.req.param("fileId")

  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }
  if (!fileId) {
    return c.json({ code: "VALIDATION_ERROR", message: "fileId is required" }, 400)
  }

  const user = c.get("user")
  const body = UpdateFileRequest.parse(await c.req.json())
  const db = getDB()
  const now = new Date().toISOString()

  const file = await db
    .select()
    .from(fileObject)
    .where(and(eq(fileObject.id, fileId), eq(fileObject.workspaceId, workspaceId)))
    .get()

  if (!file || file.isDeleted) {
    return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  }

  const updateSet: Record<string, unknown> = { updatedAt: now }

  if (body.name !== undefined) {
    const newExt = body.name.includes(".")
      ? (body.name.split(".").pop()?.toLowerCase() ?? null)
      : null
    updateSet.originalName = body.name
    updateSet.extension = newExt
  }

  if (body.folderId !== undefined) {
    if (body.folderId !== null) {
      const targetFolder = await db
        .select({ id: folder.id })
        .from(folder)
        .where(
          and(
            eq(folder.id, body.folderId),
            eq(folder.workspaceId, workspaceId),
            eq(folder.isDeleted, false),
          ),
        )
        .get()

      if (!targetFolder) {
        return c.json({ code: "PARENT_NOT_FOUND", message: "Folder not found" }, 404)
      }
    }
    updateSet.folderId = body.folderId
  }

  await db
    .update(fileObject)
    .set(updateSet)
    .where(eq(fileObject.id, fileId))
    .run()

  const updated = await db
    .select()
    .from(fileObject)
    .where(eq(fileObject.id, fileId))
    .get()

  const isMove = body.folderId !== undefined && body.folderId !== file.folderId
  const isRename = body.name !== undefined && body.name !== file.originalName

  if (isRename || isMove) {
    const action = isMove ? "file.move" : "file.rename"
    const metadata: Record<string, unknown> = {}
    if (isRename) {
      metadata.previousName = file.originalName
      metadata.newName = body.name
    }
    if (isMove) {
      metadata.previousFolderId = file.folderId
      metadata.newFolderId = body.folderId
    }

    await db
      .insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        workspaceId,
        actorId: user.id,
        action,
        resourceType: "file",
        resourceId: fileId,
        metadata: JSON.stringify(metadata),
        createdAt: now,
      })
      .run()
  }

  return c.json(updated)
})

files.post("/:fileId/favorite", requirePermission("files.favorite"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const fileId = c.req.param("fileId")

  if (!workspaceId || !fileId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and fileId are required" }, 400)
  }

  const user = c.get("user")
  const db = getDB()
  const file = await db
    .select()
    .from(fileObject)
    .where(and(eq(fileObject.id, fileId), eq(fileObject.workspaceId, workspaceId)))
    .get()

  if (!file || file.isDeleted) {
    return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  }

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

  return c.json(
    ToggleFavoriteResponse.parse({
      fileId,
      isFavorited: nextIsFavorited,
    }),
  )
})

files.post("/:fileId/tags", requirePermission("files.tag"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const fileId = c.req.param("fileId")

  if (!workspaceId || !fileId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and fileId are required" }, 400)
  }

  const body = UpdateFileTagsRequest.parse(await c.req.json())
  const db = getDB()

  const file = await db
    .select()
    .from(fileObject)
    .where(and(eq(fileObject.id, fileId), eq(fileObject.workspaceId, workspaceId)))
    .get()

  if (!file || file.isDeleted) {
    return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  }

  const uniqueTagIds = Array.from(new Set(body.tagIds))
  if (uniqueTagIds.length > 0) {
    const tags = await db
      .select({ id: fileTag.id })
      .from(fileTag)
      .where(and(eq(fileTag.workspaceId, workspaceId), inArray(fileTag.id, uniqueTagIds)))
      .all()

    if (tags.length !== uniqueTagIds.length) {
      return c.json({ code: "VALIDATION_ERROR", message: "One or more tags are invalid" }, 400)
    }
  }

  await db.delete(fileObjectTag).where(eq(fileObjectTag.fileObjectId, fileId)).run()

  if (uniqueTagIds.length > 0) {
    await db.insert(fileObjectTag).values(
      uniqueTagIds.map((tagId) => ({
        id: crypto.randomUUID(),
        fileObjectId: fileId,
        tagId,
      })),
    ).run()
  }

  const updated = await db
    .select()
    .from(fileObject)
    .where(eq(fileObject.id, fileId))
    .get()

  if (!updated) {
    return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  }

  const [hydrated] = await hydrateFiles(db, workspaceId, c.get("user").id, [updated])
  return c.json(hydrated ?? updated)
})

files.post("/:fileId/restore", requirePermission("files.restore"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const fileId = c.req.param("fileId")

  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }
  if (!fileId) {
    return c.json({ code: "VALIDATION_ERROR", message: "fileId is required" }, 400)
  }

  const user = c.get("user")
  const trashService = new TrashService(getDB(), createStorageProvider(c.env))

  try {
    const result = await trashService.restoreFile({
      workspaceId,
      fileId,
      actorId: user.id,
    })

    return c.json(result)
  } catch (err) {
    if (err instanceof TrashServiceError) {
      return c.json({ code: err.code, message: err.message }, err.status as never)
    }
    throw err
  }
})

files.delete("/:fileId/permanent", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const fileId = c.req.param("fileId")

  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }
  if (!fileId) {
    return c.json({ code: "VALIDATION_ERROR", message: "fileId is required" }, 400)
  }

  const user = c.get("user")
  const db = getDB()
  const role = await getWorkspaceRole(db, workspaceId, user.id)

  if (!role) {
    return c.json({ code: "WORKSPACE_ACCESS_DENIED", message: "Not a workspace member" }, 403)
  }

  if (!can(role, "trash.permanent_delete")) {
    return c.json({ code: "FORBIDDEN", message: "Only owners and admins can permanently delete files" }, 403)
  }

  const trashService = new TrashService(db, createStorageProvider(c.env))

  try {
    const result = await trashService.permanentlyDeleteFile({
      workspaceId,
      fileId,
      actorId: user.id,
    })

    return c.json(result)
  } catch (err) {
    if (err instanceof TrashServiceError) {
      return c.json({ code: err.code, message: err.message }, err.status as never)
    }
    throw err
  }
})

files.get("/:fileId/thumbnail", requirePermission("files.read"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const fileId = c.req.param("fileId")
  const db = getDB()

  if (!workspaceId || !fileId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and fileId are required" }, 400)
  }

  const file = await db
    .select()
    .from(fileObject)
    .where(and(eq(fileObject.id, fileId), eq(fileObject.workspaceId, workspaceId)))
    .get()

  if (!file || file.isDeleted) {
    return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  }

  if (!file.thumbnailKey) {
    return c.json({ code: "THUMBNAIL_NOT_FOUND", message: "Thumbnail not yet generated" }, 404)
  }

  const storage = createStorageProvider(c.env)
  const signedUrl = await storage.generateSignedDownloadUrl(file.thumbnailKey, 300)
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  return c.json(ThumbnailUrlResponse.parse({ signedUrl, expiresAt }))
})

files.post("/:fileId/thumbnail", requirePermission("files.upload"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const fileId = c.req.param("fileId")

  if (!workspaceId || !fileId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and fileId are required" }, 400)
  }

  const db = getDB()
  const file = await db
    .select()
    .from(fileObject)
    .where(and(eq(fileObject.id, fileId), eq(fileObject.workspaceId, workspaceId)))
    .get()

  if (!file || file.isDeleted) {
    return c.json({ code: "FILE_NOT_FOUND", message: "File not found" }, 404)
  }

  const blob = await c.req.blob()
  if (blob.size === 0) {
    return c.json({ code: "VALIDATION_ERROR", message: "Thumbnail blob is required" }, 400)
  }

  const thumbnailService = new ThumbnailService({ storage: c.env.STORAGE })
  await thumbnailService.uploadVideoFrame({ fileId, workspaceId, blob })

  return c.json({ success: true })
})

files.delete("/:fileId", requirePermission("files.delete"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const fileId = c.req.param("fileId")

  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }
  if (!fileId) {
    return c.json({ code: "VALIDATION_ERROR", message: "fileId is required" }, 400)
  }

  const user = c.get("user")
  const trashService = new TrashService(getDB(), createStorageProvider(c.env))

  try {
    const result = await trashService.softDeleteFile({
      workspaceId,
      fileId,
      actorId: user.id,
    })

    return c.json(result)
  } catch (err) {
    if (err instanceof TrashServiceError) {
      return c.json({ code: err.code, message: err.message }, err.status as never)
    }
    throw err
  }
})

async function syncR2IfStale(params: {
  env: FilesEnv
  workspaceId: string
  userId: string
}): Promise<void> {
  const db = getDB()
  const settings = await db
    .select({
      r2LastSyncAt: workspaceSettings.r2LastSyncAt,
      r2SyncStatus: workspaceSettings.r2SyncStatus,
      updatedAt: workspaceSettings.updatedAt,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, params.workspaceId))
    .get()

  const now = Date.now()
  const lastAttemptAt = settings?.updatedAt ? Date.parse(settings.updatedAt) : NaN
  if (
    (settings?.r2SyncStatus === "syncing" || settings?.r2SyncStatus === "failed") &&
    Number.isFinite(lastAttemptAt) &&
    now - lastAttemptAt < AUTO_R2_SYNC_INTERVAL_MS
  ) {
    return
  }

  if (settings?.r2LastSyncAt) {
    const lastSyncAt = Date.parse(settings.r2LastSyncAt)
    if (Number.isFinite(lastSyncAt) && now - lastSyncAt < AUTO_R2_SYNC_INTERVAL_MS) {
      return
    }
  }

  try {
    const storage = createStorageProvider(params.env)
    const service = new R2ImportService(storage)
    await service.syncWorkspace({
      workspaceId: params.workspaceId,
      userId: params.userId,
    })
  } catch (err) {
    console.warn("Automatic R2 sync failed:", err)
  }
}

export const filesHandler = files
