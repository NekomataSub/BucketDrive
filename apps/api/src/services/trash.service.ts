import { and, eq, inArray, isNull, ne, or, sql, type InferSelectModel } from "drizzle-orm"
import type { z } from "zod"
import {
  auditLog,
  bucketSettings,
  favorite,
  fileObject,
  fileObjectTag,
  folder,
  shareLink,
} from "@bucketdrive/shared/db/schema"
import type { getDB } from "../lib/db"
import type { StorageProvider } from "./storage"
import type {
  ListTrashRequest,
  RestoreFileResponse,
  RestoreFolderResponse,
  TrashItem,
} from "@bucketdrive/shared"

type DB = ReturnType<typeof getDB>
type FileRow = InferSelectModel<typeof fileObject>
type FolderRow = InferSelectModel<typeof folder>
type TrashBatchResourceType = "file" | "folder"
type ListTrashQuery = z.infer<typeof ListTrashRequest>
type RestoreFileResult = z.infer<typeof RestoreFileResponse>
type RestoreFolderResult = z.infer<typeof RestoreFolderResponse>
type TrashBatchResult = {
  success: boolean
  processed: Array<{ resourceType: TrashBatchResourceType; id: string }>
  failed: Array<{ resourceType: TrashBatchResourceType; id: string; code: string; message: string }>
}

const DAY_MS = 24 * 60 * 60 * 1000

function splitFileName(name: string) {
  const lastDot = name.lastIndexOf(".")
  if (lastDot <= 0) return { baseName: name, extension: "" }
  return { baseName: name.slice(0, lastDot), extension: name.slice(lastDot) }
}

function dirnamePath(path: string) {
  if (!path || path === "/") return "/"
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path
  const lastSlash = normalized.lastIndexOf("/")
  return lastSlash <= 0 ? "/" : normalized.slice(0, lastSlash)
}

function joinPath(parentPath: string | null, name: string) {
  return !parentPath || parentPath === "/" ? `/${name}` : `${parentPath}/${name}`
}

function computeDaysRemaining(deletedAt: string, retentionDays: number) {
  const deletedAtMs = new Date(deletedAt).getTime()
  if (Number.isNaN(deletedAtMs)) return retentionDays
  return Math.max(0, retentionDays - Math.floor((Date.now() - deletedAtMs) / DAY_MS))
}

async function recordAudit(
  db: DB,
  params: {
    actorId: string
    action: string
    resourceType: "file" | "folder" | "trash"
    resourceId?: string | null
    metadata?: Record<string, unknown> | null
  },
) {
  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      actorId: params.actorId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      createdAt: new Date().toISOString(),
    })
    .run()
}

export class TrashService {
  constructor(
    private db: DB,
    private storage: StorageProvider,
  ) {}

  async listTrash(query: ListTrashQuery) {
    const retentionDays = await this.getRetentionDays()
    const [files, folders, folderRows] = await Promise.all([
      this.db.select().from(fileObject).where(eq(fileObject.isDeleted, true)).all(),
      this.db.select().from(folder).where(eq(folder.isDeleted, true)).all(),
      this.db.select().from(folder).all(),
    ])
    const folderById = new Map(folderRows.map((row) => [row.id, row]))
    const visibleFiles = files.filter(
      (row) => !this.hasDeletedFolderAncestor(row.folderId, folderById),
    )
    const visibleFolders = folders.filter(
      (row) => !this.hasDeletedFolderAncestor(row.parentFolderId, folderById),
    )
    const items: TrashItem[] = [
      ...visibleFiles.map((row) => ({
        resourceType: "file" as const,
        id: row.id,
        name: row.originalName,
        originalLocation: row.folderId ? (folderById.get(row.folderId)?.path ?? "/") : "/",
        deletedAt: row.deletedAt ?? row.updatedAt,
        daysRemaining: computeDaysRemaining(row.deletedAt ?? row.updatedAt, retentionDays),
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        extension: row.extension,
      })),
      ...visibleFolders.map((row) => ({
        resourceType: "folder" as const,
        id: row.id,
        name: row.name,
        originalLocation: dirnamePath(row.path),
        deletedAt: row.deletedAt ?? row.updatedAt,
        daysRemaining: computeDaysRemaining(row.deletedAt ?? row.updatedAt, retentionDays),
        path: row.path,
      })),
    ]

    const searchTerm = query.q?.toLowerCase()
    const filtered = searchTerm
      ? items.filter(
          (item) =>
            item.name.toLowerCase().includes(searchTerm) ||
            item.originalLocation.toLowerCase().includes(searchTerm),
        )
      : items
    const sorted = [...filtered].sort((a, b) => {
      const dir = query.order === "asc" ? 1 : -1
      if (query.sort === "name") return a.name.localeCompare(b.name) * dir
      if (query.sort === "location")
        return a.originalLocation.localeCompare(b.originalLocation) * dir
      if (query.sort === "size") {
        return (
          ((a.resourceType === "file" ? a.sizeBytes : 0) -
            (b.resourceType === "file" ? b.sizeBytes : 0)) *
          dir
        )
      }
      return a.deletedAt.localeCompare(b.deletedAt) * dir
    })
    const start = (query.page - 1) * query.limit
    const paged = sorted.slice(start, start + query.limit)
    return {
      data: paged,
      meta: {
        page: query.page,
        limit: query.limit,
        total: sorted.length,
        totalPages: Math.ceil(sorted.length / query.limit),
      },
    }
  }

  async softDeleteFile(params: { fileId: string; actorId: string }) {
    const file = await this.db
      .select()
      .from(fileObject)
      .where(eq(fileObject.id, params.fileId))
      .get()
    if (!file) throw new TrashServiceError("FILE_NOT_FOUND", "File not found", 404)
    if (file.isDeleted)
      throw new TrashServiceError("RESOURCE_DELETED", "File is already deleted", 410)
    const now = new Date().toISOString()
    await this.db
      .update(fileObject)
      .set({ isDeleted: true, deletedAt: now, updatedAt: now })
      .where(eq(fileObject.id, file.id))
      .run()
    await this.deactivateFavorites([file.id])
    await this.deactivateShares([{ resourceType: "file", resourceId: file.id }], now)
    await recordAudit(this.db, {
      actorId: params.actorId,
      action: "file.deleted",
      resourceType: "file",
      resourceId: file.id,
      metadata: { fileName: file.originalName },
    })
    return { success: true as const, fileId: file.id }
  }

  async softDeleteFolder(params: { folderId: string; actorId: string }) {
    const target = await this.db.select().from(folder).where(eq(folder.id, params.folderId)).get()
    if (!target) throw new TrashServiceError("FOLDER_NOT_FOUND", "Folder not found", 404)
    if (target.isDeleted)
      throw new TrashServiceError("RESOURCE_DELETED", "Folder is already deleted", 410)
    const now = new Date().toISOString()
    const tree = await this.collectFolderTree(params.folderId)
    const folderIds = tree.map((row) => row.id)
    const fileRows = folderIds.length
      ? await this.db
          .select()
          .from(fileObject)
          .where(and(inArray(fileObject.folderId, folderIds), eq(fileObject.isDeleted, false)))
          .all()
      : []

    if (fileRows.length > 0) {
      await this.db
        .update(fileObject)
        .set({ isDeleted: true, deletedAt: now, updatedAt: now })
        .where(
          inArray(
            fileObject.id,
            fileRows.map((row) => row.id),
          ),
        )
        .run()
      await this.deactivateFavorites(fileRows.map((row) => row.id))
    }
    await this.db
      .update(folder)
      .set({ isDeleted: true, deletedAt: now, updatedAt: now })
      .where(inArray(folder.id, folderIds))
      .run()
    await this.deactivateShares(
      [
        ...folderIds.map((id) => ({ resourceType: "folder" as const, resourceId: id })),
        ...fileRows.map((row) => ({ resourceType: "file" as const, resourceId: row.id })),
      ],
      now,
    )
    for (const row of fileRows) {
      await recordAudit(this.db, {
        actorId: params.actorId,
        action: "file.deleted",
        resourceType: "file",
        resourceId: row.id,
        metadata: { fileName: row.originalName, deletedByFolderId: params.folderId },
      })
    }
    for (const row of tree) {
      await recordAudit(this.db, {
        actorId: params.actorId,
        action: "folder.deleted",
        resourceType: "folder",
        resourceId: row.id,
        metadata: { folderName: row.name, deletedByFolderId: params.folderId },
      })
    }
    return { success: true as const, folderId: params.folderId }
  }

  async restoreFile(params: { fileId: string; actorId: string }): Promise<RestoreFileResult> {
    const file = await this.db
      .select()
      .from(fileObject)
      .where(eq(fileObject.id, params.fileId))
      .get()
    if (!file) throw new TrashServiceError("FILE_NOT_FOUND", "File not found", 404)
    if (!file.isDeleted) throw new TrashServiceError("CONFLICT", "File is not in trash", 409)
    const targetFolder = file.folderId
      ? await this.db.select().from(folder).where(eq(folder.id, file.folderId)).get()
      : null
    let restoredToFolderId: string | null = null
    if (targetFolder?.isDeleted) {
      restoredToFolderId = await this.restoreDeletedFolderPath(targetFolder)
    } else if (targetFolder) {
      restoredToFolderId = targetFolder.id
    }
    const restoredToRoot = restoredToFolderId === null
    const restoredName = await this.getUniqueFileName(
      restoredToFolderId,
      file.originalName,
      file.id,
    )
    const extension = splitFileName(restoredName).extension.replace(/^\./, "") || null
    await this.db
      .update(fileObject)
      .set({
        isDeleted: false,
        deletedAt: null,
        folderId: restoredToFolderId,
        originalName: restoredName,
        extension,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(fileObject.id, file.id))
      .run()
    await this.reactivateFavorites([file.id])
    await recordAudit(this.db, {
      actorId: params.actorId,
      action: restoredToRoot ? "file.restored_to_root" : "file.restored",
      resourceType: "file",
      resourceId: file.id,
      metadata: { restoredName, restoredToFolderId, originalFolderId: file.folderId },
    })
    return { success: true, fileId: file.id, restoredToFolderId, restoredName, restoredToRoot }
  }

  async restoreFolder(params: { folderId: string; actorId: string }): Promise<RestoreFolderResult> {
    const target = await this.db.select().from(folder).where(eq(folder.id, params.folderId)).get()
    if (!target) throw new TrashServiceError("FOLDER_NOT_FOUND", "Folder not found", 404)
    if (!target.isDeleted) throw new TrashServiceError("CONFLICT", "Folder is not in trash", 409)
    const allFolders = await this.db.select().from(folder).all()
    const allFiles = await this.db.select().from(fileObject).all()
    const folderById = new Map(allFolders.map((row) => [row.id, row]))
    const tree = this.collectFolderTreeFromRows(allFolders, params.folderId)
    const folderIds = tree.map((row) => row.id)
    const fileRows = allFiles.filter(
      (row) => row.folderId !== null && folderIds.includes(row.folderId),
    )
    const originalParent = target.parentFolderId
      ? (folderById.get(target.parentFolderId) ?? null)
      : null
    const restoredToRoot = !originalParent || originalParent.isDeleted
    const restoredToFolderId = restoredToRoot ? null : originalParent.id
    const restoredName = await this.getUniqueFolderName(restoredToFolderId, target.name, target.id)
    const restoredPathById = new Map<string, string>()
    const rootPath = joinPath(restoredToRoot ? null : originalParent.path, restoredName)
    restoredPathById.set(target.id, rootPath)
    await this.db
      .update(folder)
      .set({
        isDeleted: false,
        deletedAt: null,
        parentFolderId: restoredToFolderId,
        name: restoredName,
        path: rootPath,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(folder.id, target.id))
      .run()
    const descendants = tree
      .filter((row) => row.id !== target.id)
      .sort((a, b) => a.path.length - b.path.length)
    for (const row of descendants) {
      const nextPath = joinPath(
        row.parentFolderId ? (restoredPathById.get(row.parentFolderId) ?? null) : null,
        row.name,
      )
      restoredPathById.set(row.id, nextPath)
      await this.db
        .update(folder)
        .set({
          isDeleted: false,
          deletedAt: null,
          path: nextPath,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(folder.id, row.id))
        .run()
    }
    if (fileRows.length > 0) {
      await this.db
        .update(fileObject)
        .set({ isDeleted: false, deletedAt: null, updatedAt: new Date().toISOString() })
        .where(
          inArray(
            fileObject.id,
            fileRows.map((row) => row.id),
          ),
        )
        .run()
      await this.reactivateFavorites(fileRows.map((row) => row.id))
    }
    await recordAudit(this.db, {
      actorId: params.actorId,
      action: restoredToRoot ? "folder.restored_to_root" : "folder.restored",
      resourceType: "folder",
      resourceId: target.id,
      metadata: {
        restoredName,
        restoredToFolderId,
        originalParentFolderId: target.parentFolderId,
        restoredDescendantCount: descendants.length,
        restoredFileCount: fileRows.length,
      },
    })
    return { success: true, folderId: target.id, restoredToFolderId, restoredName, restoredToRoot }
  }

  async permanentlyDeleteFile(params: { fileId: string; actorId: string; action?: string }) {
    const file = await this.db
      .select()
      .from(fileObject)
      .where(eq(fileObject.id, params.fileId))
      .get()
    if (!file) throw new TrashServiceError("FILE_NOT_FOUND", "File not found", 404)
    if (!file.isDeleted)
      throw new TrashServiceError(
        "CONFLICT",
        "File must be in trash before permanent deletion",
        409,
      )
    await this.purgeFiles([file], params.actorId, params.action ?? "file.permanently_deleted")
    return { success: true as const, fileId: file.id }
  }

  async permanentlyDeleteFolder(params: { folderId: string; actorId: string; action?: string }) {
    const target = await this.db.select().from(folder).where(eq(folder.id, params.folderId)).get()
    if (!target) throw new TrashServiceError("FOLDER_NOT_FOUND", "Folder not found", 404)
    if (!target.isDeleted)
      throw new TrashServiceError(
        "CONFLICT",
        "Folder must be in trash before permanent deletion",
        409,
      )
    const tree = this.collectFolderTreeFromRows(
      await this.db.select().from(folder).all(),
      target.id,
    )
    const folderIds = tree.map((row) => row.id)
    const files = folderIds.length
      ? await this.db.select().from(fileObject).where(inArray(fileObject.folderId, folderIds)).all()
      : []
    await this.purgeFiles(
      files,
      params.actorId,
      params.action === "folder.auto_purged" ? "file.auto_purged" : "file.permanently_deleted",
    )
    await this.deleteSharesForResources(
      folderIds.map((id) => ({ resourceType: "folder" as const, resourceId: id })),
    )
    await this.db.delete(folder).where(inArray(folder.id, folderIds)).run()
    for (const row of tree.sort((a, b) => b.path.length - a.path.length)) {
      await recordAudit(this.db, {
        actorId: params.actorId,
        action: params.action ?? "folder.permanently_deleted",
        resourceType: "folder",
        resourceId: row.id,
        metadata: { folderName: row.name, path: row.path },
      })
    }
    return { success: true as const, folderId: params.folderId }
  }

  async restoreAllTrash(actorId: string): Promise<TrashBatchResult> {
    const result = this.createBatchResult()
    const allFolders = await this.db.select().from(folder).all()
    const folderById = new Map(allFolders.map((row) => [row.id, row]))
    const deletedFolders = allFolders.filter(
      (row) => row.isDeleted && !this.hasDeletedFolderAncestor(row.parentFolderId, folderById),
    )

    for (const row of deletedFolders.sort((a, b) => a.path.length - b.path.length)) {
      const current = await this.db
        .select({ isDeleted: folder.isDeleted })
        .from(folder)
        .where(eq(folder.id, row.id))
        .get()
      if (!current?.isDeleted) continue

      await this.captureBatch(result, "folder", row.id, () =>
        this.restoreFolder({ folderId: row.id, actorId }),
      )
    }

    const activeFolders = await this.db.select().from(folder).all()
    const activeFolderById = new Map(activeFolders.map((row) => [row.id, row]))
    const deletedFiles = (
      await this.db
        .select({ id: fileObject.id, folderId: fileObject.folderId })
        .from(fileObject)
        .where(eq(fileObject.isDeleted, true))
        .all()
    ).filter((row) => !this.hasDeletedFolderAncestor(row.folderId, activeFolderById))

    for (const row of deletedFiles) {
      await this.captureBatch(result, "file", row.id, () =>
        this.restoreFile({ fileId: row.id, actorId }),
      )
    }

    return this.finalizeBatchResult(result)
  }

  async emptyTrash(actorId: string): Promise<TrashBatchResult> {
    const result = this.createBatchResult()
    const allFolders = await this.db.select().from(folder).all()
    const folderById = new Map(allFolders.map((row) => [row.id, row]))
    const deletedFolders = allFolders.filter(
      (row) => row.isDeleted && !this.hasDeletedFolderAncestor(row.parentFolderId, folderById),
    )

    for (const row of deletedFolders.sort((a, b) => a.path.length - b.path.length)) {
      const current = await this.db
        .select({ isDeleted: folder.isDeleted })
        .from(folder)
        .where(eq(folder.id, row.id))
        .get()
      if (!current?.isDeleted) continue

      await this.captureBatch(result, "folder", row.id, () =>
        this.permanentlyDeleteFolder({ folderId: row.id, actorId }),
      )
    }

    const remainingFolders = await this.db.select().from(folder).all()
    const remainingFolderById = new Map(remainingFolders.map((row) => [row.id, row]))
    const deletedFiles = (
      await this.db
        .select({ id: fileObject.id, folderId: fileObject.folderId })
        .from(fileObject)
        .where(eq(fileObject.isDeleted, true))
        .all()
    ).filter((row) => !this.hasDeletedFolderAncestor(row.folderId, remainingFolderById))

    for (const row of deletedFiles) {
      await this.captureBatch(result, "file", row.id, () =>
        this.permanentlyDeleteFile({ fileId: row.id, actorId }),
      )
    }

    return this.finalizeBatchResult(result)
  }

  async purgeExpiredTrash(actorId = "system") {
    const retentionDays = await this.getRetentionDays()
    const [deletedFiles, deletedFolders] = await Promise.all([
      this.db.select().from(fileObject).where(eq(fileObject.isDeleted, true)).all(),
      this.db.select().from(folder).where(eq(folder.isDeleted, true)).all(),
    ])
    const expiredFiles = deletedFiles.filter((row) => this.isExpired(row.deletedAt, retentionDays))
    await this.purgeFiles(expiredFiles, actorId, "file.auto_purged")
    let purgedFolders = 0
    const expiredFolders = deletedFolders
      .filter((row) => this.isExpired(row.deletedAt, retentionDays))
      .sort((a, b) => b.path.length - a.path.length)
    for (const row of expiredFolders) {
      const activeChildren = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(folder)
        .where(and(eq(folder.parentFolderId, row.id), eq(folder.isDeleted, false)))
        .get()
      const deletedChildren = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(folder)
        .where(and(eq(folder.parentFolderId, row.id), eq(folder.isDeleted, true)))
        .get()
      const childFiles = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(fileObject)
        .where(and(eq(fileObject.folderId, row.id), eq(fileObject.isDeleted, true)))
        .get()
      if (
        (activeChildren?.count ?? 0) > 0 ||
        (deletedChildren?.count ?? 0) > 0 ||
        (childFiles?.count ?? 0) > 0
      )
        continue
      await this.deleteSharesForResources([{ resourceType: "folder", resourceId: row.id }])
      await this.db.delete(folder).where(eq(folder.id, row.id)).run()
      await recordAudit(this.db, {
        actorId,
        action: "folder.auto_purged",
        resourceType: "folder",
        resourceId: row.id,
        metadata: { folderName: row.name, path: row.path },
      })
      purgedFolders += 1
    }
    return { purgedFiles: expiredFiles.length, purgedFolders }
  }

  private async getRetentionDays() {
    const settings = await this.db
      .select({ trashRetentionDays: bucketSettings.trashRetentionDays })
      .from(bucketSettings)
      .get()
    return settings?.trashRetentionDays ?? 30
  }

  private isExpired(deletedAt: string | null, retentionDays: number) {
    return (
      Boolean(deletedAt) &&
      Date.now() - new Date(deletedAt as string).getTime() >= retentionDays * DAY_MS
    )
  }

  private async deactivateFavorites(fileIds: string[]) {
    if (fileIds.length === 0) return
    await this.db
      .update(favorite)
      .set({ isActive: false })
      .where(inArray(favorite.fileObjectId, fileIds))
      .run()
  }

  private async reactivateFavorites(fileIds: string[]) {
    if (fileIds.length === 0) return
    await this.db
      .update(favorite)
      .set({ isActive: true })
      .where(inArray(favorite.fileObjectId, fileIds))
      .run()
  }

  private async deactivateShares(
    resources: Array<{ resourceType: "file" | "folder"; resourceId: string }>,
    now: string,
  ) {
    const shareIds = await this.findShareIdsForResources(resources)
    if (shareIds.length === 0) return
    await this.db
      .update(shareLink)
      .set({ isActive: false, updatedAt: now })
      .where(inArray(shareLink.id, shareIds))
      .run()
  }

  private async deleteSharesForResources(
    resources: Array<{ resourceType: "file" | "folder"; resourceId: string }>,
  ) {
    const shareIds = await this.findShareIdsForResources(resources)
    if (shareIds.length === 0) return
    await this.db.delete(shareLink).where(inArray(shareLink.id, shareIds)).run()
  }

  private async findShareIdsForResources(
    resources: Array<{ resourceType: "file" | "folder"; resourceId: string }>,
  ) {
    const fileIds = resources
      .filter((resource) => resource.resourceType === "file")
      .map((resource) => resource.resourceId)
    const folderIds = resources
      .filter((resource) => resource.resourceType === "folder")
      .map((resource) => resource.resourceId)
    const conditions = []
    if (fileIds.length > 0)
      conditions.push(
        and(eq(shareLink.resourceType, "file"), inArray(shareLink.resourceId, fileIds)),
      )
    if (folderIds.length > 0)
      conditions.push(
        and(eq(shareLink.resourceType, "folder"), inArray(shareLink.resourceId, folderIds)),
      )
    if (conditions.length === 0) return []
    return (
      await this.db
        .select({ id: shareLink.id })
        .from(shareLink)
        .where(or(...conditions))
        .all()
    ).map((row) => row.id)
  }

  private async getUniqueFileName(
    folderId: string | null,
    requestedName: string,
    excludeFileId?: string,
  ) {
    const rows = await this.db
      .select({ id: fileObject.id, originalName: fileObject.originalName })
      .from(fileObject)
      .where(
        and(
          folderId === null ? isNull(fileObject.folderId) : eq(fileObject.folderId, folderId),
          eq(fileObject.isDeleted, false),
          excludeFileId ? ne(fileObject.id, excludeFileId) : undefined,
        ),
      )
      .all()
    const names = new Set(rows.map((row) => row.originalName.toLowerCase()))
    if (!names.has(requestedName.toLowerCase())) return requestedName
    const { baseName, extension } = splitFileName(requestedName)
    const attempt = `${baseName} (restored)${extension}`
    if (!names.has(attempt.toLowerCase())) return attempt
    let index = 2
    while (names.has(`${baseName} (restored ${String(index)})${extension}`.toLowerCase()))
      index += 1
    return `${baseName} (restored ${String(index)})${extension}`
  }

  private async getUniqueFolderName(
    parentFolderId: string | null,
    requestedName: string,
    excludeFolderId?: string,
  ) {
    const rows = await this.db
      .select({ id: folder.id, name: folder.name })
      .from(folder)
      .where(
        and(
          parentFolderId === null
            ? isNull(folder.parentFolderId)
            : eq(folder.parentFolderId, parentFolderId),
          eq(folder.isDeleted, false),
          excludeFolderId ? ne(folder.id, excludeFolderId) : undefined,
        ),
      )
      .all()
    const names = new Set(rows.map((row) => row.name.toLowerCase()))
    if (!names.has(requestedName.toLowerCase())) return requestedName
    const attempt = `${requestedName} (restored)`
    if (!names.has(attempt.toLowerCase())) return attempt
    let index = 2
    while (names.has(`${requestedName} (restored ${String(index)})`.toLowerCase())) index += 1
    return `${requestedName} (restored ${String(index)})`
  }

  private async collectFolderTree(folderId: string) {
    return this.collectFolderTreeFromRows(await this.db.select().from(folder).all(), folderId)
  }

  private collectFolderTreeFromRows(rows: FolderRow[], folderId: string) {
    const childrenByParentId = new Map<string, FolderRow[]>()
    const root = rows.find((row) => row.id === folderId)
    if (!root) return []
    for (const row of rows) {
      if (!row.parentFolderId) continue
      const current = childrenByParentId.get(row.parentFolderId) ?? []
      current.push(row)
      childrenByParentId.set(row.parentFolderId, current)
    }
    const result: FolderRow[] = []
    const queue: FolderRow[] = [root]
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      result.push(current)
      queue.push(...(childrenByParentId.get(current.id) ?? []))
    }
    return result
  }

  private hasDeletedFolderAncestor(
    folderId: string | null,
    folderById: Map<string, Pick<FolderRow, "id" | "parentFolderId" | "isDeleted">>,
  ) {
    let currentId = folderId
    const visited = new Set<string>()
    while (currentId) {
      if (visited.has(currentId)) return false
      visited.add(currentId)
      const current = folderById.get(currentId)
      if (!current) return false
      if (current.isDeleted) return true
      currentId = current.parentFolderId
    }
    return false
  }

  private async restoreDeletedFolderPath(targetFolder: FolderRow) {
    const allFolders = await this.db.select().from(folder).all()
    const folderById = new Map(allFolders.map((row) => [row.id, row]))
    const deletedChain: FolderRow[] = []
    let current: FolderRow | undefined = targetFolder
    const visited = new Set<string>()

    while (current?.isDeleted) {
      if (visited.has(current.id)) break
      visited.add(current.id)
      deletedChain.push(current)
      current = current.parentFolderId ? folderById.get(current.parentFolderId) : undefined
    }

    let parentFolderId = current && !current.isDeleted ? current.id : null
    let parentPath = current && !current.isDeleted ? current.path : null
    let restoredFolderId: string | null = parentFolderId
    const now = new Date().toISOString()

    for (const row of deletedChain.reverse()) {
      const restoredName = await this.getUniqueFolderName(parentFolderId, row.name, row.id)
      const restoredPath = joinPath(parentPath, restoredName)
      await this.db
        .update(folder)
        .set({
          isDeleted: false,
          deletedAt: null,
          parentFolderId,
          name: restoredName,
          path: restoredPath,
          updatedAt: now,
        })
        .where(eq(folder.id, row.id))
        .run()

      parentFolderId = row.id
      parentPath = restoredPath
      restoredFolderId = row.id
    }

    return restoredFolderId
  }

  private createBatchResult() {
    return {
      processed: [] as TrashBatchResult["processed"],
      failed: [] as TrashBatchResult["failed"],
    }
  }

  private finalizeBatchResult(result: ReturnType<TrashService["createBatchResult"]>) {
    return {
      success: result.failed.length === 0,
      processed: result.processed,
      failed: result.failed,
    }
  }

  private async captureBatch(
    result: ReturnType<TrashService["createBatchResult"]>,
    resourceType: TrashBatchResourceType,
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
        code: err instanceof TrashServiceError ? err.code : "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Operation failed",
      })
    }
  }

  private async purgeFiles(files: FileRow[], actorId: string, action: string) {
    if (files.length === 0) return
    const fileIds = files.map((row) => row.id)
    for (const row of files) await this.storage.delete(row.storageKey)
    await this.deleteSharesForResources(
      fileIds.map((id) => ({ resourceType: "file" as const, resourceId: id })),
    )
    await this.db.delete(fileObjectTag).where(inArray(fileObjectTag.fileObjectId, fileIds)).run()
    await this.db.delete(favorite).where(inArray(favorite.fileObjectId, fileIds)).run()
    await this.db.delete(fileObject).where(inArray(fileObject.id, fileIds)).run()
    for (const row of files) {
      await recordAudit(this.db, {
        actorId,
        action,
        resourceType: "file",
        resourceId: row.id,
        metadata: { fileName: row.originalName, storageKey: row.storageKey },
      })
    }
  }
}

export class TrashServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message)
    this.name = "TrashServiceError"
  }
}
