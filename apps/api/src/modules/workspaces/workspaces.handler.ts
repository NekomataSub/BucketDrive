import { Hono } from "hono"
import { and, eq } from "drizzle-orm"
import {
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  InitiateOwnershipTransferRequest,
  OwnershipTransferResponse,
} from "@bucketdrive/shared"
import { authMiddleware } from "../../middleware/auth"
import { getDB } from "../../lib/db"
import { listWorkspaceMembershipsForUser, normalizeWorkspaceRole, syncWorkspaceMemberships } from "../../lib/workspace-membership"
import { bucket, platformSettings, user as userSchema, workspace, workspaceSettings, member, workspaceMember, auditLog } from "@bucketdrive/shared/db/schema"
import { NotificationsService } from "../notifications/notifications.service"

interface WorkspacesEnv {
  DB: D1Database
}

interface WorkspacesVariables {
  user: { id: string; email: string; name: string }
}

const workspaces = new Hono<{ Bindings: WorkspacesEnv; Variables: WorkspacesVariables }>()

workspaces.use("*", authMiddleware)

workspaces.get("/", async (c) => {
  const user = c.get("user")
  const db = getDB()

  const memberships = await listWorkspaceMembershipsForUser(db, user.id)
  if (memberships.length === 0) {
    return c.json({ data: [] })
  }

  return c.json({
    data: memberships.map((membership) => ({
      ...membership,
      role: normalizeWorkspaceRole(membership.role),
    })),
  })
})

workspaces.post("/", async (c) => {
  const actor = c.get("user")
  const db = getDB()
  const body = CreateWorkspaceRequest.parse(await c.req.json())

  const settings = await db.select().from(platformSettings).get()
  const currentUser = await db
    .select({
      isPlatformAdmin: userSchema.isPlatformAdmin,
      canCreateWorkspaces: userSchema.canCreateWorkspaces,
    })
    .from(userSchema)
    .where(eq(userSchema.id, actor.id))
    .get()

  const allowed =
    settings?.allowUserWorkspaceCreation === true ||
    currentUser?.isPlatformAdmin === true ||
    currentUser?.canCreateWorkspaces === true

  if (!allowed) {
    return c.json({ code: "FORBIDDEN", message: "Workspace creation is disabled" }, 403)
  }

  const slugBase = body.slug ?? body.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const slug = slugBase || crypto.randomUUID()
  const existing = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.slug, slug)).get()
  if (existing) {
    return c.json({ code: "CONFLICT", message: "Workspace slug already exists" }, 409)
  }

  const now = new Date().toISOString()
  const workspaceId = crypto.randomUUID()
  const created = {
    id: workspaceId,
    name: body.name,
    slug,
    ownerId: actor.id,
    storageQuotaBytes: 10 * 1024 * 1024 * 1024,
    isDeleted: false,
    isPlatformDefault: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(workspace).values(created).run()
  await db
    .insert(workspaceSettings)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  await db
    .insert(bucket)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      name: `${slug}-files`,
      provider: "r2",
      visibility: "private",
      createdAt: now,
    })
    .run()
  await db
    .insert(member)
    .values({
      id: crypto.randomUUID(),
      organizationId: workspaceId,
      userId: actor.id,
      role: "owner",
      createdAt: now,
    })
    .run()
  await db
    .insert(workspaceMember)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      userId: actor.id,
      role: "owner",
      createdAt: now,
    })
    .run()
  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      actorId: actor.id,
      action: "workspace.created",
      resourceType: "workspace",
      resourceId: workspaceId,
      metadata: JSON.stringify({ name: body.name, slug }),
      createdAt: now,
    })
    .run()

  return c.json(CreateWorkspaceResponse.parse(created), 201)
})

workspaces.post("/:workspaceId/transfer-ownership", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const actor = c.get("user")
  const db = getDB()
  const body = InitiateOwnershipTransferRequest.parse(await c.req.json())

  await syncWorkspaceMemberships(db, workspaceId)

  const ws = await db.select().from(workspace).where(eq(workspace.id, workspaceId)).get()
  if (!ws) {
    return c.json({ code: "WORKSPACE_NOT_FOUND", message: "Workspace not found" }, 404)
  }

  if (ws.ownerId !== actor.id) {
    return c.json({ code: "OWNER_REQUIRED", message: "Only the workspace owner can transfer ownership" }, 403)
  }

  if (ws.ownerId === body.newOwnerId) {
    return c.json({ code: "VALIDATION_ERROR", message: "New owner cannot be the current owner" }, 400)
  }

  const newOwnerMember = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, body.newOwnerId)))
    .get()

  if (!newOwnerMember) {
    return c.json({ code: "NOT_FOUND", message: "Target user is not a member of this workspace" }, 404)
  }

  const normalizedRole = normalizeWorkspaceRole(newOwnerMember.role)
  if (normalizedRole !== "admin") {
    return c.json({ code: "ROLE_TOO_LOW", message: "Ownership can only be transferred to an admin" }, 403)
  }

  const now = new Date().toISOString()

  // Transfer ownership
  await db.update(workspace).set({ ownerId: body.newOwnerId, updatedAt: now }).where(eq(workspace.id, workspaceId)).run()

  // Downgrade old owner to admin in member table
  const oldOwnerMember = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, actor.id)))
    .get()

  if (oldOwnerMember) {
    await db
      .update(member)
      .set({ role: "admin", createdAt: oldOwnerMember.createdAt })
      .where(eq(member.id, oldOwnerMember.id))
      .run()
    await db
      .update(workspaceMember)
      .set({ role: "admin" })
      .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, actor.id)))
      .run()
  }

  // Upgrade new owner
  await db
    .update(member)
    .set({ role: "owner", createdAt: newOwnerMember.createdAt })
    .where(eq(member.id, newOwnerMember.id))
    .run()
  await db
    .update(workspaceMember)
    .set({ role: "owner" })
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, body.newOwnerId)))
    .run()

  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      actorId: actor.id,
      action: "ownership.transferred",
      resourceType: "workspace",
      resourceId: workspaceId,
      metadata: JSON.stringify({ previousOwnerId: actor.id, newOwnerId: body.newOwnerId }),
      createdAt: now,
    })
    .run()

  // Notify new owner
  const notifications = new NotificationsService()
  await notifications.createNotification({
    userId: body.newOwnerId,
    workspaceId,
    type: "ownership.transferred",
    title: "Ownership transferred",
    message: `You are now the owner of ${ws.name}.`,
    data: { workspaceId, previousOwnerId: actor.id },
  })

  return c.json(
    OwnershipTransferResponse.parse({
      success: true,
      workspaceId,
      previousOwnerId: actor.id,
      newOwnerId: body.newOwnerId,
    }),
  )
})

export const workspacesHandler = workspaces
