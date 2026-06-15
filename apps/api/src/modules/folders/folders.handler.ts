import { Hono } from "hono"
import { and, eq, isNull } from "drizzle-orm"
import { DEFAULT_BRAND_NAME } from "@bucketdrive/shared/constants"
import { auditLog, folder, platformSettings } from "@bucketdrive/shared/db/schema"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { getDB } from "../../lib/db"
import { createStorageProvider } from "../../services/storage"
import { TrashService, TrashServiceError } from "../../services/trash.service"
import {
  BreadcrumbItemSchema,
  can,
  CreateFolderRequest,
  ListFoldersRequest,
  UpdateFolderRequest,
} from "@bucketdrive/shared"
import type { WorkspaceRole } from "@bucketdrive/shared"

interface FoldersEnv {
  DB: D1Database
  STORAGE: R2Bucket
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
}

interface FoldersVariables {
  user: { id: string; email: string; name: string; role: WorkspaceRole }
  session: { id: string; userId: string; expiresAt: Date }
}

const folders = new Hono<{ Bindings: FoldersEnv; Variables: FoldersVariables }>()

folders.use("*", authMiddleware)

folders.get("/", requirePermission("folders.read"), async (c) => {
  const query = ListFoldersRequest.parse(c.req.query())
  const db = getDB()
  const rows = await db
    .select()
    .from(folder)
    .where(
      and(
        query.parentFolderId
          ? eq(folder.parentFolderId, query.parentFolderId)
          : isNull(folder.parentFolderId),
        eq(folder.isDeleted, false),
      ),
    )
    .all()
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name))
  return c.json({
    data: sorted,
    meta: { page: 1, limit: sorted.length, total: sorted.length, totalPages: 1 },
  })
})

folders.get("/:folderId/breadcrumbs", requirePermission("folders.read"), async (c) => {
  const db = getDB()
  const segments: { id: string | null; name: string }[] = []
  let currentFolderId: string | null = c.req.param("folderId")
  while (currentFolderId) {
    const current = await db.select().from(folder).where(eq(folder.id, currentFolderId)).get()
    if (!current) break
    segments.unshift({ id: current.id, name: current.name })
    currentFolderId = current.parentFolderId
  }
  const settings = await db
    .select({ name: platformSettings.platformName })
    .from(platformSettings)
    .get()
  segments.unshift({ id: null, name: settings?.name ?? DEFAULT_BRAND_NAME })
  return c.json(segments.map((item) => BreadcrumbItemSchema.parse(item)))
})

folders.post("/", requirePermission("folders.create"), async (c) => {
  const user = c.get("user")
  const body = CreateFolderRequest.parse(await c.req.json())
  const db = getDB()
  const now = new Date().toISOString()
  let folderPath = `/${body.name}`

  if (body.parentFolderId) {
    const parent = await db.select().from(folder).where(eq(folder.id, body.parentFolderId)).get()
    if (!parent || parent.isDeleted)
      return c.json({ code: "PARENT_NOT_FOUND", message: "Parent folder not found" }, 404)
    folderPath = `${parent.path}/${body.name}`
  }

  const id = crypto.randomUUID()
  await db
    .insert(folder)
    .values({
      id,
      parentFolderId: body.parentFolderId ?? null,
      name: body.name,
      path: folderPath,
      createdBy: user.id,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  const created = await db.select().from(folder).where(eq(folder.id, id)).get()
  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      actorId: user.id,
      action: "folder.create",
      resourceType: "folder",
      resourceId: id,
      metadata: JSON.stringify({ folderName: body.name, parentFolderId: body.parentFolderId }),
      createdAt: now,
    })
    .run()
  return c.json(created, 201)
})

folders.patch("/:folderId", requirePermission("folders.rename"), async (c) => {
  const folderId = c.req.param("folderId")
  const user = c.get("user")
  const body = UpdateFolderRequest.parse(await c.req.json())
  const db = getDB()
  const now = new Date().toISOString()
  const target = await db.select().from(folder).where(eq(folder.id, folderId)).get()
  if (!target || target.isDeleted)
    return c.json({ code: "FOLDER_NOT_FOUND", message: "Folder not found" }, 404)

  const updateSet: Record<string, unknown> = { updatedAt: now }
  if (body.name !== undefined && body.name !== target.name) updateSet.name = body.name
  if (body.parentFolderId !== undefined && body.parentFolderId !== target.parentFolderId) {
    if (body.parentFolderId !== null) {
      if (body.parentFolderId === folderId)
        return c.json({ code: "INVALID_MOVE", message: "Cannot move a folder into itself" }, 400)
      const parent = await db.select().from(folder).where(eq(folder.id, body.parentFolderId)).get()
      if (!parent || parent.isDeleted)
        return c.json({ code: "PARENT_NOT_FOUND", message: "Parent folder not found" }, 404)
      if (parent.path === target.path || parent.path.startsWith(`${target.path}/`)) {
        return c.json(
          { code: "INVALID_MOVE", message: "Cannot move a folder into its descendant" },
          400,
        )
      }
    }
    updateSet.parentFolderId = body.parentFolderId
  }

  const previousPath = target.path
  if (body.name !== undefined || body.parentFolderId !== undefined) {
    const nextName = body.name ?? target.name
    const parentId = body.parentFolderId !== undefined ? body.parentFolderId : target.parentFolderId
    const parentPath = parentId
      ? ((await db.select().from(folder).where(eq(folder.id, parentId)).get())?.path ?? "")
      : ""
    updateSet.path = parentPath ? `${parentPath}/${nextName}` : `/${nextName}`
  }

  await db.update(folder).set(updateSet).where(eq(folder.id, folderId)).run()

  const nextPath = typeof updateSet.path === "string" ? updateSet.path : previousPath
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

  const isRename = body.name !== undefined && body.name !== target.name
  const isMove = body.parentFolderId !== undefined && body.parentFolderId !== target.parentFolderId
  if (isRename || isMove) {
    await db
      .insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        actorId: user.id,
        action: isMove ? "folder.move" : "folder.rename",
        resourceType: "folder",
        resourceId: folderId,
        metadata: JSON.stringify({
          previousName: target.name,
          newName: body.name,
          previousParentId: target.parentFolderId,
          newParentId: body.parentFolderId,
        }),
        createdAt: now,
      })
      .run()
  }

  return c.json(await db.select().from(folder).where(eq(folder.id, folderId)).get())
})

folders.post("/:folderId/restore", requirePermission("folders.restore"), async (c) => {
  try {
    return c.json(
      await new TrashService(getDB(), createStorageProvider(c.env)).restoreFolder({
        folderId: c.req.param("folderId"),
        actorId: c.get("user").id,
      }),
    )
  } catch (err) {
    if (err instanceof TrashServiceError)
      return c.json({ code: err.code, message: err.message }, err.status as never)
    throw err
  }
})

folders.delete("/:folderId/permanent", async (c) => {
  if (!can(c.get("user").role, "trash.permanent_delete")) {
    return c.json(
      { code: "FORBIDDEN", message: "Only owners and admins can permanently delete folders" },
      403,
    )
  }
  try {
    return c.json(
      await new TrashService(getDB(), createStorageProvider(c.env)).permanentlyDeleteFolder({
        folderId: c.req.param("folderId"),
        actorId: c.get("user").id,
      }),
    )
  } catch (err) {
    if (err instanceof TrashServiceError)
      return c.json({ code: err.code, message: err.message }, err.status as never)
    throw err
  }
})

folders.delete("/:folderId", requirePermission("folders.delete"), async (c) => {
  try {
    return c.json(
      await new TrashService(getDB(), createStorageProvider(c.env)).softDeleteFolder({
        folderId: c.req.param("folderId"),
        actorId: c.get("user").id,
      }),
    )
  } catch (err) {
    if (err instanceof TrashServiceError)
      return c.json({ code: err.code, message: err.message }, err.status as never)
    throw err
  }
})

export const foldersHandler = folders
