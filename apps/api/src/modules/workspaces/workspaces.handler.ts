import { Hono } from "hono"
import type { Handler } from "hono"
import { eq } from "drizzle-orm"
import { InitiateOwnershipTransferRequest, OwnershipTransferResponse } from "@bucketdrive/shared"
import { auditLog, user } from "@bucketdrive/shared/db/schema"
import { getDB } from "../../lib/db"
import { ensureBucketSettings, getOrCreateDefaultBucket } from "../../lib/bucket"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { normalizeWorkspaceRole } from "../../lib/workspace-membership"

interface WorkspacesVariables {
  user: {
    id: string
    role: string
  }
}

const workspaces = new Hono<{ Variables: WorkspacesVariables }>()

workspaces.use("*", authMiddleware)

workspaces.get("/", async (c) => {
  const db = getDB()
  const currentUser = c.get("user")
  const defaultBucket = await getOrCreateDefaultBucket(db)
  const settings = await ensureBucketSettings(db)
  const createdAt = defaultBucket.createdAt

  return c.json({
    data: [
      {
        id: defaultBucket.id,
        name: defaultBucket.name,
        slug: "bucket",
        ownerId: currentUser.id,
        role: currentUser.role,
        storageQuotaBytes: settings.storageQuotaBytes,
        createdAt,
        updatedAt: settings.updatedAt,
      },
    ],
  })
})

export const transferOwnershipHandler: Handler<{ Variables: WorkspacesVariables }> = async (c) => {
  const actor = c.get("user")
  if (normalizeWorkspaceRole(actor.role) !== "owner") {
    return c.json({ code: "OWNER_REQUIRED", message: "Only the owner can transfer ownership" }, 403)
  }

  const body = InitiateOwnershipTransferRequest.parse(await c.req.json())
  if (body.newOwnerId === actor.id) {
    return c.json({ code: "FORBIDDEN", message: "You already own this bucket" }, 403)
  }

  const db = getDB()
  const target = await db.select().from(user).where(eq(user.id, body.newOwnerId)).get()
  if (!target) return c.json({ code: "NOT_FOUND", message: "Member not found" }, 404)
  if (normalizeWorkspaceRole(target.role) !== "admin") {
    return c.json({ code: "ROLE_TOO_LOW", message: "New owner must be an admin" }, 403)
  }

  const now = new Date().toISOString()
  await db.update(user).set({ role: "admin", updatedAt: now }).where(eq(user.id, actor.id)).run()
  await db
    .update(user)
    .set({ role: "owner", updatedAt: now })
    .where(eq(user.id, body.newOwnerId))
    .run()
  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      actorId: actor.id,
      action: "ownership.transferred",
      resourceType: "member",
      resourceId: body.newOwnerId,
      metadata: JSON.stringify({ previousOwnerId: actor.id, newOwnerId: body.newOwnerId }),
      createdAt: now,
    })
    .run()

  return c.json(
    OwnershipTransferResponse.parse({
      success: true,
      previousOwnerId: actor.id,
      newOwnerId: body.newOwnerId,
    }),
  )
}

workspaces.post(
  "/transfer-ownership",
  requirePermission("users.update_roles"),
  transferOwnershipHandler,
)
workspaces.post(
  "/:workspaceId/transfer-ownership",
  requirePermission("users.update_roles"),
  transferOwnershipHandler,
)

export const workspacesHandler = workspaces
