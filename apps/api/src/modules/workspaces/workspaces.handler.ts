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
import {
  ensureOrganizationForWorkspace,
  listWorkspaceMembershipsForUser,
  normalizeWorkspaceRole,
  syncMemberToLegacyWorkspaceMember,
  syncWorkspaceMemberships,
} from "../../lib/workspace-membership"
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

type DB = ReturnType<typeof getDB>
type WorkspaceRow = typeof workspace.$inferSelect

export async function ensureWorkspaceCreationRecords(
  db: DB,
  currentWorkspace: WorkspaceRow,
  now: string,
) {
  const existingSettings = await db
    .select({ id: workspaceSettings.id })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, currentWorkspace.id))
    .get()

  if (!existingSettings) {
    await db
      .insert(workspaceSettings)
      .values({
        id: crypto.randomUUID(),
        workspaceId: currentWorkspace.id,
        createdAt: currentWorkspace.createdAt,
        updatedAt: now,
      })
      .run()
  }

  const existingBucket = await db
    .select({ id: bucket.id })
    .from(bucket)
    .where(eq(bucket.workspaceId, currentWorkspace.id))
    .get()

  if (!existingBucket) {
    await db
      .insert(bucket)
      .values({
        id: crypto.randomUUID(),
        workspaceId: currentWorkspace.id,
        name: `${currentWorkspace.slug}-files`,
        provider: "r2",
        visibility: "private",
        createdAt: currentWorkspace.createdAt,
      })
      .run()
  }

  const settings = await db.select().from(platformSettings).get()
  if (!settings) {
    await db
      .insert(platformSettings)
      .values({
        id: crypto.randomUUID(),
        defaultWorkspaceId: currentWorkspace.id,
        allowUserWorkspaceCreation: false,
        enablePublicSignup: false,
        platformName: "BucketDrive",
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }

  await ensureOrganizationForWorkspace(db, currentWorkspace.id)

  const existingMember = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, currentWorkspace.id), eq(member.userId, currentWorkspace.ownerId)))
    .get()

  if (!existingMember) {
    await db
      .insert(member)
      .values({
        id: crypto.randomUUID(),
        organizationId: currentWorkspace.id,
        userId: currentWorkspace.ownerId,
        role: "owner",
        createdAt: now,
      })
      .run()
  }

  await syncMemberToLegacyWorkspaceMember(db, currentWorkspace.id, currentWorkspace.ownerId, "owner")
}

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
      id: userSchema.id,
      isPlatformAdmin: userSchema.isPlatformAdmin,
      canCreateWorkspaces: userSchema.canCreateWorkspaces,
    })
    .from(userSchema)
    .where(eq(userSchema.id, actor.id))
    .get()

  if (!currentUser) {
    return c.json({ code: "UNAUTHORIZED", message: "Authenticated user was not found" }, 401)
  }

  const allowed =
    settings?.allowUserWorkspaceCreation === true ||
    currentUser.isPlatformAdmin ||
    currentUser.canCreateWorkspaces

  if (!allowed) {
    return c.json({ code: "FORBIDDEN", message: "Workspace creation is disabled" }, 403)
  }

  const slugBase = body.slug ?? body.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const slug = slugBase || crypto.randomUUID()
  const existing = await db.select().from(workspace).where(eq(workspace.slug, slug)).get()
  if (existing) {
    if (existing.ownerId === actor.id && !existing.isDeleted) {
      try {
        await ensureWorkspaceCreationRecords(db, existing, new Date().toISOString())
        return c.json(CreateWorkspaceResponse.parse(existing), 200)
      } catch (error) {
        console.error("Failed to recover workspace creation", error)
        return c.json({ code: "INTERNAL_ERROR", message: "Failed to complete workspace setup" }, 500)
      }
    }

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

  try {
    await db.insert(workspace).values(created).run()
    await ensureWorkspaceCreationRecords(db, created, now)
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
  } catch (error) {
    console.error("Failed to create workspace", error)
    return c.json({ code: "INTERNAL_ERROR", message: "Failed to create workspace" }, 500)
  }

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
