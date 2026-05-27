import { Hono } from "hono"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { getDB } from "../../lib/db"
import { folder, workspace, auditLog } from "@bucketdrive/shared/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { createStorageProvider } from "../../services/storage"
import { TrashService, TrashServiceError, getWorkspaceRole } from "../../services/trash.service"
import {
  ListFoldersRequest,
  BreadcrumbItemSchema,
  CreateFolderRequest,
  UpdateFolderRequest,
} from "@bucketdrive/shared"

interface FoldersEnv {
  DB: D1Database
  STORAGE: R2Bucket
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
}

interface FoldersVariables {
  user: { id: string; email: string; name: string }
  session: { id: string; userId: string; expiresAt: Date }
}

const folders = new Hono<{ Bindings: FoldersEnv; Variables: FoldersVariables }>()

folders.use("*", authMiddleware)

folders.get("/", requirePermission("folders.read"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const query = ListFoldersRequest.parse(c.req.query())
  const db = getDB()

  const where = query.parentFolderId
    ? and(
        eq(folder.workspaceId, workspaceId),
        eq(folder.parentFolderId, query.parentFolderId),
        eq(folder.isDeleted, false),
      )
    : and(
        eq(folder.workspaceId, workspaceId),
        isNull(folder.parentFolderId),
        eq(folder.isDeleted, false),
      )

  const rows = await db
    .select()
    .from(folder)
    .where(where)
    .all()

  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name))

  return c.json({
    data: sorted,
    meta: {
      page: 1,
      limit: sorted.length,
      total: sorted.length,
      totalPages: 1,
    },
  })
})

folders.get("/:folderId/breadcrumbs", requirePermission("folders.read"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const folderId = c.req.param("folderId")

  if (!workspaceId || !folderId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and folderId are required" }, 400)
  }

  const db = getDB()

  const ws = await db
    .select()
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .get()

  if (!ws) {
    return c.json({ code: "WORKSPACE_NOT_FOUND", message: "Workspace not found" }, 404)
  }

  const segments: { id: string | null; name: string }[] = []

  let currentFolderId: string | null = folderId

  while (currentFolderId) {
    const f = await db
      .select()
      .from(folder)
      .where(and(eq(folder.id, currentFolderId), eq(folder.workspaceId, workspaceId)))
      .get()

    if (!f) break

    segments.unshift({ id: f.id, name: f.name })
    currentFolderId = f.parentFolderId
  }

  segments.unshift({ id: null, name: ws.name })

  const result = segments.map((item) => BreadcrumbItemSchema.parse(item))

  return c.json(result)
})

folders.post("/", requirePermission("folders.create"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const user = c.get("user")
  const body = CreateFolderRequest.parse(await c.req.json())
  const db = getDB()
  const now = new Date().toISOString()
  const newFolderId = crypto.randomUUID()

  let folderPath: string

  if (body.parentFolderId) {
    const parent = await db
      .select()
      .from(folder)
      .where(and(eq(folder.id, body.parentFolderId), eq(folder.workspaceId, workspaceId)))
      .get()

    if (!parent || parent.isDeleted) {
      return c.json({ code: "PARENT_NOT_FOUND", message: "Parent folder not found" }, 404)
    }

    folderPath = `${parent.path}/${body.name}`
  } else {
    folderPath = `/${body.name}`
  }

  await db
    .insert(folder)
    .values({
      id: newFolderId,
      workspaceId,
      parentFolderId: body.parentFolderId ?? null,
      name: body.name,
      path: folderPath,
      createdBy: user.id,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  const created = await db
    .select()
    .from(folder)
    .where(eq(folder.id, newFolderId))
    .get()

  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      actorId: user.id,
      action: "folder.create",
      resourceType: "folder",
      resourceId: newFolderId,
      metadata: JSON.stringify({ folderName: body.name, parentFolderId: body.parentFolderId }),
      createdAt: now,
    })
    .run()

  return c.json(created, 201)
})

folders.patch("/:folderId", requirePermission("folders.rename"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const folderId = c.req.param("folderId")

  if (!workspaceId || !folderId) {
    return c.json(
      { code: "VALIDATION_ERROR", message: "workspaceId and folderId are required" },
      400,
    )
  }

  const user = c.get("user")
  const body = UpdateFolderRequest.parse(await c.req.json())
  const db = getDB()
  const now = new Date().toISOString()

  const target = await db
    .select()
    .from(folder)
    .where(and(eq(folder.id, folderId), eq(folder.workspaceId, workspaceId)))
    .get()

  if (!target || target.isDeleted) {
    return c.json({ code: "FOLDER_NOT_FOUND", message: "Folder not found" }, 404)
  }

  const updateSet: Record<string, unknown> = { updatedAt: now }

  if (body.name !== undefined && body.name !== target.name) {
    updateSet.name = body.name
  }

  if (body.parentFolderId !== undefined && body.parentFolderId !== target.parentFolderId) {
    if (body.parentFolderId !== null) {
      if (body.parentFolderId === folderId) {
        return c.json({ code: "INVALID_MOVE", message: "Cannot move a folder into itself" }, 400)
      }

      const parent = await db
        .select()
        .from(folder)
        .where(
          and(eq(folder.id, body.parentFolderId), eq(folder.workspaceId, workspaceId)),
        )
        .get()

      if (!parent || parent.isDeleted) {
        return c.json({ code: "PARENT_NOT_FOUND", message: "Parent folder not found" }, 404)
      }

      if (parent.path === target.path || parent.path.startsWith(`${target.path}/`)) {
        return c.json({ code: "INVALID_MOVE", message: "Cannot move a folder into its descendant" }, 400)
      }
    }

    updateSet.parentFolderId = body.parentFolderId

    const newName = body.name ?? target.name
    const newParentPath = body.parentFolderId
      ? (await db.select().from(folder).where(eq(folder.id, body.parentFolderId)).get())?.path ?? ""
      : ""

    const newPath = body.parentFolderId ? `${newParentPath}/${newName}` : `/${newName}`
    updateSet.path = newPath
  } else if (body.name !== undefined && body.name !== target.name) {
    const parentPath = target.parentFolderId
      ? (await db.select().from(folder).where(eq(folder.id, target.parentFolderId)).get())?.path ?? ""
      : ""

    const newPath = target.parentFolderId ? `${parentPath}/${body.name}` : `/${body.name}`
    updateSet.path = newPath
  }

  const previousPath = target.path
  const nextPath = typeof updateSet.path === "string" ? updateSet.path : previousPath

  await db
    .update(folder)
    .set(updateSet)
    .where(eq(folder.id, folderId))
    .run()

  if (nextPath !== previousPath) {
    const descendants = await db
      .select()
      .from(folder)
      .where(and(eq(folder.workspaceId, workspaceId), eq(folder.isDeleted, false)))
      .all()

    for (const descendant of descendants) {
      if (!descendant.path.startsWith(`${previousPath}/`)) continue

      await db
        .update(folder)
        .set({
          path: `${nextPath}${descendant.path.slice(previousPath.length)}`,
          updatedAt: now,
        })
        .where(eq(folder.id, descendant.id))
        .run()
    }
  }

  const updated = await db
    .select()
    .from(folder)
    .where(eq(folder.id, folderId))
    .get()

  const isRename = body.name !== undefined && body.name !== target.name
  const isMove = body.parentFolderId !== undefined && body.parentFolderId !== target.parentFolderId

  if (isRename || isMove) {
    const auditAction = isMove ? "folder.move" : "folder.rename"
    const auditMetadata: Record<string, unknown> = {}
    if (isRename) {
      auditMetadata.previousName = target.name
      auditMetadata.newName = body.name
    }
    if (isMove) {
      auditMetadata.previousParentId = target.parentFolderId
      auditMetadata.newParentId = body.parentFolderId
    }

    await db
      .insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        workspaceId,
        actorId: user.id,
        action: auditAction,
        resourceType: "folder",
        resourceId: folderId,
        metadata: JSON.stringify(auditMetadata),
        createdAt: now,
      })
      .run()
  }

  return c.json(updated)
})

folders.post("/:folderId/restore", requirePermission("folders.restore"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const folderId = c.req.param("folderId")

  if (!workspaceId || !folderId) {
    return c.json(
      { code: "VALIDATION_ERROR", message: "workspaceId and folderId are required" },
      400,
    )
  }

  const user = c.get("user")
  const trashService = new TrashService(getDB(), createStorageProvider(c.env))

  try {
    const result = await trashService.restoreFolder({
      workspaceId,
      folderId,
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

folders.delete("/:folderId/permanent", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const folderId = c.req.param("folderId")

  if (!workspaceId || !folderId) {
    return c.json(
      { code: "VALIDATION_ERROR", message: "workspaceId and folderId are required" },
      400,
    )
  }

  const user = c.get("user")
  const db = getDB()
  const role = await getWorkspaceRole(db, workspaceId, user.id)

  if (!role) {
    return c.json({ code: "WORKSPACE_ACCESS_DENIED", message: "Not a workspace member" }, 403)
  }

  if (role !== "owner" && role !== "admin") {
    return c.json(
      { code: "FORBIDDEN", message: "Only owners and admins can permanently delete folders" },
      403,
    )
  }

  const trashService = new TrashService(db, createStorageProvider(c.env))

  try {
    const result = await trashService.permanentlyDeleteFolder({
      workspaceId,
      folderId,
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

folders.delete("/:folderId", requirePermission("folders.delete"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const folderId = c.req.param("folderId")

  if (!workspaceId || !folderId) {
    return c.json(
      { code: "VALIDATION_ERROR", message: "workspaceId and folderId are required" },
      400,
    )
  }

  const user = c.get("user")
  const trashService = new TrashService(getDB(), createStorageProvider(c.env))

  try {
    const result = await trashService.softDeleteFolder({
      workspaceId,
      folderId,
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

export const foldersHandler = folders
