import { Hono } from "hono"
import { and, eq, inArray } from "drizzle-orm"
import { Zip, ZipPassThrough } from "fflate"
import { auditLog, fileObject, folder } from "@bucketdrive/shared/db/schema"
import {
  BatchDownloadRequest,
  BatchMoveRequest,
  BatchOperationResponse,
  BatchPermanentDeleteRequest,
  BatchRestoreRequest,
  BatchRevokeSharesRequest,
  BatchTrashRequest,
  can,
  type Permission,
  type WorkspaceRole,
} from "@bucketdrive/shared"
import { authMiddleware } from "../../middleware/auth"
import { getDB } from "../../lib/db"
import { createStorageProvider, type StorageProvider } from "../../services/storage"
import { TrashService, TrashServiceError } from "../../services/trash.service"
import { ShareError, SharesService } from "../shares/shares.service"

interface BatchEnv {
  DB: D1Database
  STORAGE: R2Bucket
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
}

interface BatchVariables {
  user: { id: string; email: string; name: string; role: WorkspaceRole }
}

type ResourceType = "file" | "folder" | "share"
type ProcessedItem = { resourceType: ResourceType; id: string }
type FailedItem = ProcessedItem & { code: string; message: string }
type ZipFile = {
  file: typeof fileObject.$inferSelect
  path: string
}

const batch = new Hono<{ Bindings: BatchEnv; Variables: BatchVariables }>()

batch.use("*", authMiddleware)

batch.post("/trash", async (c) => {
  const body = BatchTrashRequest.parse(await c.req.json())
  const user = c.get("user")
  const service = new TrashService(getDB(), createStorageProvider(c.env))
  const result = createBatchResult()

  for (const fileId of unique(body.files)) {
    if (!(await canAccessFile(fileId, user, "files.delete"))) {
      result.failed.push(forbidden("file", fileId, "files.delete"))
      continue
    }
    await capture(result, "file", fileId, () =>
      service.softDeleteFile({ fileId, actorId: user.id }),
    )
  }

  for (const folderId of unique(body.folders)) {
    if (!(await canAccessFolder(folderId, user, "folders.delete"))) {
      result.failed.push(forbidden("folder", folderId, "folders.delete"))
      continue
    }
    await capture(result, "folder", folderId, () =>
      service.softDeleteFolder({ folderId, actorId: user.id }),
    )
  }

  return c.json(BatchOperationResponse.parse(finalize(result)))
})

batch.post("/restore", async (c) => {
  const body = BatchRestoreRequest.parse(await c.req.json())
  const user = c.get("user")
  const service = new TrashService(getDB(), createStorageProvider(c.env))
  const result = createBatchResult()

  for (const folderId of unique(body.folders)) {
    if (!(await canAccessFolder(folderId, user, "folders.restore"))) {
      result.failed.push(forbidden("folder", folderId, "folders.restore"))
      continue
    }
    await capture(result, "folder", folderId, () =>
      service.restoreFolder({ folderId, actorId: user.id }),
    )
  }

  for (const fileId of unique(body.files)) {
    if (!(await canAccessFile(fileId, user, "files.restore"))) {
      result.failed.push(forbidden("file", fileId, "files.restore"))
      continue
    }
    await capture(result, "file", fileId, () => service.restoreFile({ fileId, actorId: user.id }))
  }

  return c.json(BatchOperationResponse.parse(finalize(result)))
})

batch.post("/permanent-delete", async (c) => {
  const body = BatchPermanentDeleteRequest.parse(await c.req.json())
  const user = c.get("user")
  const service = new TrashService(getDB(), createStorageProvider(c.env))
  const result = createBatchResult()

  if (!can(user.role, "trash.permanent_delete")) {
    for (const fileId of unique(body.files)) {
      result.failed.push(forbidden("file", fileId, "trash.permanent_delete"))
    }
    for (const folderId of unique(body.folders)) {
      result.failed.push(forbidden("folder", folderId, "trash.permanent_delete"))
    }
    return c.json(BatchOperationResponse.parse(finalize(result)), 403)
  }

  for (const fileId of unique(body.files)) {
    await capture(result, "file", fileId, () =>
      service.permanentlyDeleteFile({ fileId, actorId: user.id }),
    )
  }

  for (const folderId of unique(body.folders)) {
    await capture(result, "folder", folderId, () =>
      service.permanentlyDeleteFolder({ folderId, actorId: user.id }),
    )
  }

  return c.json(BatchOperationResponse.parse(finalize(result)))
})

batch.post("/move", async (c) => {
  const body = BatchMoveRequest.parse(await c.req.json())
  const user = c.get("user")
  const result = createBatchResult()
  const db = getDB()

  if (body.targetFolderId) {
    const target = await db
      .select({ id: folder.id })
      .from(folder)
      .where(and(eq(folder.id, body.targetFolderId), eq(folder.isDeleted, false)))
      .get()
    if (!target) {
      for (const fileId of unique(body.files)) {
        result.failed.push({
          resourceType: "file",
          id: fileId,
          code: "PARENT_NOT_FOUND",
          message: "Folder not found",
        })
      }
      for (const folderId of unique(body.folders)) {
        result.failed.push({
          resourceType: "folder",
          id: folderId,
          code: "PARENT_NOT_FOUND",
          message: "Folder not found",
        })
      }
      return c.json(BatchOperationResponse.parse(finalize(result)), 404)
    }
  }

  for (const fileId of unique(body.files)) {
    if (!(await canAccessFile(fileId, user, "files.move"))) {
      result.failed.push(forbidden("file", fileId, "files.move"))
      continue
    }
    await capture(result, "file", fileId, () =>
      moveFile({ fileId, targetFolderId: body.targetFolderId, actorId: user.id }),
    )
  }

  for (const folderId of unique(body.folders)) {
    if (!(await canAccessFolder(folderId, user, "folders.move"))) {
      result.failed.push(forbidden("folder", folderId, "folders.move"))
      continue
    }
    await capture(result, "folder", folderId, () =>
      moveFolder({ folderId, targetFolderId: body.targetFolderId, actorId: user.id }),
    )
  }

  return c.json(BatchOperationResponse.parse(finalize(result)))
})

batch.post("/download", async (c) => {
  const body = BatchDownloadRequest.parse(await c.req.json())
  const user = c.get("user")
  const db = getDB()
  const storage = createStorageProvider(c.env)
  const result = createBatchResult()
  const zipFiles: ZipFile[] = []
  const usedNames = new Set<string>()

  for (const fileId of unique(body.files)) {
    if (!(await canAccessFile(fileId, user, "files.read"))) {
      result.failed.push(forbidden("file", fileId, "files.read"))
      continue
    }

    const file = await db
      .select()
      .from(fileObject)
      .where(and(eq(fileObject.id, fileId), eq(fileObject.isDeleted, false)))
      .get()
    if (!file) {
      result.failed.push({
        resourceType: "file",
        id: fileId,
        code: "NOT_FOUND",
        message: "File not found",
      })
      continue
    }

    addFileToZipPlan({
      result,
      zipFiles,
      usedNames,
      file,
      path: file.originalName,
    })
  }

  for (const folderId of unique(body.folders)) {
    if (!(await canAccessFolder(folderId, user, "folders.read"))) {
      result.failed.push(forbidden("folder", folderId, "folders.read"))
      continue
    }

    const root = await db
      .select()
      .from(folder)
      .where(and(eq(folder.id, folderId), eq(folder.isDeleted, false)))
      .get()
    if (!root) {
      result.failed.push({
        resourceType: "folder",
        id: folderId,
        code: "NOT_FOUND",
        message: "Folder not found",
      })
      continue
    }

    const activeFolders = await db.select().from(folder).where(eq(folder.isDeleted, false)).all()
    const folderRows = activeFolders.filter(
      (candidate) => candidate.path === root.path || candidate.path.startsWith(`${root.path}/`),
    )
    const folderIds = folderRows.map((candidate) => candidate.id)
    const folderById = new Map(folderRows.map((candidate) => [candidate.id, candidate]))

    const files =
      folderIds.length > 0
        ? await db
            .select()
            .from(fileObject)
            .where(and(eq(fileObject.isDeleted, false), inArray(fileObject.folderId, folderIds)))
            .all()
        : []

    for (const file of files) {
      if (!(await canAccessFile(file.id, user, "files.read"))) {
        result.failed.push(forbidden("file", file.id, "files.read"))
        continue
      }
      const parent = file.folderId ? folderById.get(file.folderId) : null
      const folderPath = parent?.path.replace(/^\/+/, "") ?? root.name
      addFileToZipPlan({
        result,
        zipFiles,
        usedNames,
        file,
        path: `${folderPath}/${file.originalName}`,
      })
    }

    result.processed.push({ resourceType: "folder", id: folderId })
  }

  if (zipFiles.length === 0) {
    return c.json(
      {
        code: "NO_DOWNLOADABLE_FILES",
        message:
          result.failed.length === 0
            ? "No downloadable files found"
            : "No downloadable files found for this selection",
        failed: result.failed,
      },
      getNoDownloadStatus(result.failed) as never,
    )
  }

  const zipName = `bucketdrive-selection-${new Date().toISOString().slice(0, 10)}.zip`

  return new Response(streamZipFiles(storage, zipFiles), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": buildAttachmentDisposition(zipName),
    },
  })
})

batch.post("/download-urls", async (c) => {
  const body = BatchDownloadRequest.parse(await c.req.json())
  const user = c.get("user")
  const db = getDB()
  const storage = createStorageProvider(c.env)
  const result = createBatchResult()
  const zipFiles: ZipFile[] = []
  const usedNames = new Set<string>()
  const manifestOnly = c.req.query("manifestOnly") === "1"

  for (const fileId of unique(body.files)) {
    if (!(await canAccessFile(fileId, user, "files.read"))) {
      result.failed.push(forbidden("file", fileId, "files.read"))
      continue
    }

    const file = await db
      .select()
      .from(fileObject)
      .where(and(eq(fileObject.id, fileId), eq(fileObject.isDeleted, false)))
      .get()
    if (!file) {
      result.failed.push({
        resourceType: "file",
        id: fileId,
        code: "NOT_FOUND",
        message: "File not found",
      })
      continue
    }

    addFileToZipPlan({
      result,
      zipFiles,
      usedNames,
      file,
      path: file.originalName,
    })
  }

  for (const folderId of unique(body.folders)) {
    if (!(await canAccessFolder(folderId, user, "folders.read"))) {
      result.failed.push(forbidden("folder", folderId, "folders.read"))
      continue
    }

    const root = await db
      .select()
      .from(folder)
      .where(and(eq(folder.id, folderId), eq(folder.isDeleted, false)))
      .get()
    if (!root) {
      result.failed.push({
        resourceType: "folder",
        id: folderId,
        code: "NOT_FOUND",
        message: "Folder not found",
      })
      continue
    }

    const activeFolders = await db.select().from(folder).where(eq(folder.isDeleted, false)).all()
    const folderRows = activeFolders.filter(
      (candidate) => candidate.path === root.path || candidate.path.startsWith(`${root.path}/`),
    )
    const folderIds = folderRows.map((candidate) => candidate.id)
    const folderById = new Map(folderRows.map((candidate) => [candidate.id, candidate]))

    const files =
      folderIds.length > 0
        ? await db
            .select()
            .from(fileObject)
            .where(and(eq(fileObject.isDeleted, false), inArray(fileObject.folderId, folderIds)))
            .all()
        : []

    for (const file of files) {
      if (!(await canAccessFile(file.id, user, "files.read"))) {
        result.failed.push(forbidden("file", file.id, "files.read"))
        continue
      }
      const parent = file.folderId ? folderById.get(file.folderId) : null
      const folderPath = parent?.path.replace(/^\/+/, "") ?? root.name
      addFileToZipPlan({
        result,
        zipFiles,
        usedNames,
        file,
        path: `${folderPath}/${file.originalName}`,
      })
    }

    result.processed.push({ resourceType: "folder", id: folderId })
  }

  if (zipFiles.length === 0) {
    return c.json(
      {
        code: "NO_DOWNLOADABLE_FILES",
        message:
          result.failed.length === 0
            ? "No downloadable files found"
            : "No downloadable files found for this selection",
        failed: result.failed,
      },
      getNoDownloadStatus(result.failed) as never,
    )
  }

  const filesWithUrls = await Promise.all(
    zipFiles.map(async (zipFile) => {
      const entry = {
        id: zipFile.file.id,
        name: zipFile.file.originalName,
        fileName: zipFile.file.originalName,
        sizeBytes: zipFile.file.sizeBytes,
        path: zipFile.path,
      }
      if (manifestOnly) return entry

      const url = await storage.generateSignedDownloadUrl(zipFile.file.storageKey, 900, {
        filename: zipFile.file.originalName,
      })
      return {
        ...entry,
        url,
        signedUrl: url,
      }
    }),
  )

  return c.json({
    files: filesWithUrls,
    failed: result.failed,
    processed: result.processed,
  })
})

batch.post("/shares/revoke", async (c) => {
  const body = BatchRevokeSharesRequest.parse(await c.req.json())
  const user = c.get("user")
  const service = new SharesService()
  const result = createBatchResult()

  for (const shareId of unique(body.shareIds)) {
    await capture(result, "share", shareId, () =>
      service.revokeShare({ shareId, userId: user.id, role: user.role }),
    )
  }

  return c.json(BatchOperationResponse.parse(finalize(result)))
})

function createBatchResult() {
  return { processed: [] as ProcessedItem[], failed: [] as FailedItem[] }
}

function finalize(result: ReturnType<typeof createBatchResult>) {
  return { success: result.failed.length === 0, processed: result.processed, failed: result.failed }
}

function unique(ids: string[]) {
  return Array.from(new Set(ids))
}

function forbidden(resourceType: ResourceType, id: string, permission: Permission): FailedItem {
  return {
    resourceType,
    id,
    code: "FORBIDDEN",
    message: `Permission denied: ${permission}`,
  }
}

function getNoDownloadStatus(failed: FailedItem[]) {
  if (failed.length === 0) return 404
  if (failed.every((item) => item.code === "FORBIDDEN")) return 403
  if (failed.some((item) => item.code === "NOT_FOUND" || item.code === "OBJECT_NOT_FOUND")) {
    return 404
  }
  return 422
}

async function capture(
  result: ReturnType<typeof createBatchResult>,
  resourceType: ResourceType,
  id: string,
  operation: () => Promise<unknown>,
) {
  try {
    await operation()
    result.processed.push({ resourceType, id })
  } catch (err) {
    result.failed.push({
      resourceType,
      id,
      code:
        err instanceof TrashServiceError || err instanceof ShareError ? err.code : "INTERNAL_ERROR",
      message: err instanceof Error ? err.message : "Operation failed",
    })
  }
}

function addFileToZipPlan(params: {
  result: ReturnType<typeof createBatchResult>
  zipFiles: ZipFile[]
  usedNames: Set<string>
  file: typeof fileObject.$inferSelect
  path: string
}) {
  params.zipFiles.push({
    file: params.file,
    path: uniqueZipPath(params.usedNames, params.path),
  })
  params.result.processed.push({ resourceType: "file", id: params.file.id })
}

function streamZipFiles(storage: StorageProvider, zipFiles: ZipFile[]) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((error, chunk) => {
        if (error) {
          controller.error(error)
          return
        }
        controller.enqueue(chunk)
      })

      const missingFiles: ZipFile[] = []

      try {
        for (const zipFile of zipFiles) {
          let source: ReadableStream<Uint8Array> | null = null

          try {
            const object = await storage.getObject(zipFile.file.storageKey)
            if (object) {
              source = object.body
            }
          } catch {
            console.warn(`Batch download: failed to read ${zipFile.file.originalName}`)
          }

          if (!source) {
            console.warn(
              `Batch download: skipping ${zipFile.file.originalName} (not found in storage)`,
            )
            missingFiles.push(zipFile)
            continue
          }

          const entry = new ZipPassThrough(zipFile.path)
          zip.add(entry)

          const reader = source.getReader()

          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            entry.push(value, false)
          }

          entry.push(new Uint8Array(), true)
        }

        if (missingFiles.length > 0) {
          const errorText = [
            "Some files were not found in storage and could not be included:",
            "",
            ...missingFiles.map((f) => `  - ${f.file.originalName}`),
            "",
            "If you need these files, please try downloading them individually.",
          ].join("\n")

          const entry = new ZipPassThrough("_errors.txt")
          zip.add(entry)
          entry.push(new TextEncoder().encode(errorText), true)
        }

        zip.end()
        controller.close()
      } catch (error) {
        zip.terminate()
        controller.error(error)
      }
    },
  })
}

function uniqueZipPath(usedNames: Set<string>, path: string) {
  const cleanPath = path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/")
  const candidate = cleanPath || "file"
  if (!usedNames.has(candidate)) {
    usedNames.add(candidate)
    return candidate
  }

  const slash = candidate.lastIndexOf("/")
  const dir = slash >= 0 ? candidate.slice(0, slash + 1) : ""
  const filename = slash >= 0 ? candidate.slice(slash + 1) : candidate
  const dot = filename.lastIndexOf(".")
  const base = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot) : ""

  for (let index = 2; ; index += 1) {
    const next = `${dir}${base} (${String(index)})${ext}`
    if (!usedNames.has(next)) {
      usedNames.add(next)
      return next
    }
  }
}

function buildAttachmentDisposition(filename: string) {
  const asciiName = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_")
  const encodedName = encodeURIComponent(filename)
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`
}

async function canAccessFile(fileId: string, user: BatchVariables["user"], permission: Permission) {
  const row = await getDB()
    .select({ ownerId: fileObject.ownerId })
    .from(fileObject)
    .where(eq(fileObject.id, fileId))
    .get()
  return row ? can(user.role, permission, row.ownerId, user.id) : true
}

async function canAccessFolder(
  folderId: string,
  user: BatchVariables["user"],
  permission: Permission,
) {
  const row = await getDB()
    .select({ createdBy: folder.createdBy })
    .from(folder)
    .where(eq(folder.id, folderId))
    .get()
  return row ? can(user.role, permission, row.createdBy, user.id) : true
}

async function moveFile(params: {
  fileId: string
  targetFolderId: string | null
  actorId: string
}) {
  const db = getDB()
  const file = await db
    .select()
    .from(fileObject)
    .where(and(eq(fileObject.id, params.fileId), eq(fileObject.isDeleted, false)))
    .get()
  if (!file) throw new Error("File not found")

  const now = new Date().toISOString()
  await db
    .update(fileObject)
    .set({ folderId: params.targetFolderId, updatedAt: now })
    .where(eq(fileObject.id, params.fileId))
    .run()
  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      actorId: params.actorId,
      action: "file.move",
      resourceType: "file",
      resourceId: params.fileId,
      metadata: JSON.stringify({
        previousFolderId: file.folderId,
        newFolderId: params.targetFolderId,
      }),
      createdAt: now,
    })
    .run()
}

async function moveFolder(params: {
  folderId: string
  targetFolderId: string | null
  actorId: string
}) {
  const db = getDB()
  const target = await db
    .select()
    .from(folder)
    .where(and(eq(folder.id, params.folderId), eq(folder.isDeleted, false)))
    .get()
  if (!target) throw new Error("Folder not found")
  if (params.targetFolderId === params.folderId) throw new Error("Cannot move a folder into itself")

  const parent = params.targetFolderId
    ? await db
        .select()
        .from(folder)
        .where(and(eq(folder.id, params.targetFolderId), eq(folder.isDeleted, false)))
        .get()
    : null
  if (params.targetFolderId && !parent) throw new Error("Folder not found")
  if (parent && (parent.path === target.path || parent.path.startsWith(`${target.path}/`))) {
    throw new Error("Cannot move a folder into its descendant")
  }

  const now = new Date().toISOString()
  const previousPath = target.path
  const nextPath = parent ? `${parent.path}/${target.name}` : `/${target.name}`
  await db
    .update(folder)
    .set({ parentFolderId: params.targetFolderId, path: nextPath, updatedAt: now })
    .where(eq(folder.id, target.id))
    .run()

  if (nextPath !== previousPath) {
    const descendants = await db.select().from(folder).where(eq(folder.isDeleted, false)).all()
    for (const descendant of descendants) {
      if (!descendant.path.startsWith(`${previousPath}/`)) continue
      await db
        .update(folder)
        .set({ path: `${nextPath}${descendant.path.slice(previousPath.length)}`, updatedAt: now })
        .where(eq(folder.id, descendant.id))
        .run()
    }
  }

  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      actorId: params.actorId,
      action: "folder.move",
      resourceType: "folder",
      resourceId: params.folderId,
      metadata: JSON.stringify({
        previousParentId: target.parentFolderId,
        newParentId: params.targetFolderId,
      }),
      createdAt: now,
    })
    .run()
}

export const batchHandler = batch
