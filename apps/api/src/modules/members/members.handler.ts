import { Hono } from "hono"
import { eq } from "drizzle-orm"
import {
  AddMemberRequest,
  CreateInvitationResponse,
  ListMembersResponse,
  RemoveMemberResponse,
  UpdateMemberRoleRequest,
  canAssignWorkspaceRole,
  canManageWorkspaceRole,
  normalizeWorkspaceRole,
  type WorkspaceRole,
} from "@bucketdrive/shared"
import { auditLog, user } from "@bucketdrive/shared/db/schema"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { getDB } from "../../lib/db"
import { createInvitation } from "./invitation-service"

interface MembersEnv {
  DB: D1Database
  APP_URL?: string
}

interface MembersVariables {
  user: { id: string; email: string; name: string; role: WorkspaceRole }
  session: { id: string; userId: string; expiresAt: Date }
}

const members = new Hono<{ Bindings: MembersEnv; Variables: MembersVariables }>()

members.use("*", authMiddleware)

members.get("/", requirePermission("users.read"), async (c) => {
  const rows = await getDB().select().from(user).all()
  const data = rows.map((row) => ({
    id: row.id,
    userId: row.id,
    role: row.role,
    email: row.email,
    name: row.name,
    image: row.image,
    createdAt: toIsoDateTime(row.createdAt),
  }))
  return c.json(
    ListMembersResponse.parse({
      data,
      meta: {
        page: 1,
        limit: data.length || 1,
        total: data.length,
        totalPages: data.length > 0 ? 1 : 0,
      },
    }),
  )
})

members.post("/", requirePermission("users.invite"), async (c) => {
  const actor = c.get("user")
  const db = getDB()
  const body = AddMemberRequest.parse(await c.req.json())
  if (!canAssignWorkspaceRole(actor.role, body.role)) {
    return c.json({ code: "ROLE_TOO_LOW", message: "Cannot invite a role above your own" }, 403)
  }

  const result = await createInvitation(db, actor, body, c.env.APP_URL)
  if ("error" in result) return c.json(result.error.body, result.error.status)

  return c.json(CreateInvitationResponse.parse(result.data), 201)
})

members.patch("/:memberId", requirePermission("users.update_roles"), async (c) => {
  const memberId = c.req.param("memberId")
  const actor = c.get("user")
  const db = getDB()
  const body = UpdateMemberRoleRequest.parse(await c.req.json())
  const target = await db.select().from(user).where(eq(user.id, memberId)).get()
  if (!target) return c.json({ code: "NOT_FOUND", message: "Member not found" }, 404)
  if (memberId === actor.id) {
    return c.json({ code: "FORBIDDEN", message: "You cannot change your own role" }, 403)
  }

  const targetRole = normalizeWorkspaceRole(target.role)
  if (targetRole === "owner") {
    return c.json(
      { code: "OWNER_REQUIRED", message: "Use ownership transfer to change the owner" },
      403,
    )
  }
  if (!canManageWorkspaceRole(actor.role, targetRole)) {
    return c.json({ code: "ROLE_TOO_LOW", message: "Cannot manage this member role" }, 403)
  }
  if (!canAssignWorkspaceRole(actor.role, body.role)) {
    return c.json({ code: "ROLE_TOO_LOW", message: "Cannot assign a role above your own" }, 403)
  }

  await db
    .update(user)
    .set({ role: body.role, updatedAt: new Date().toISOString() })
    .where(eq(user.id, memberId))
    .run()
  await writeAudit(db, actor.id, "member.role_updated", memberId, {
    previousRole: target.role,
    role: body.role,
    userId: target.id,
  })
  const updated = await db.select().from(user).where(eq(user.id, memberId)).get()
  return c.json(
    updated
      ? {
          id: updated.id,
          userId: updated.id,
          role: updated.role,
          email: updated.email,
          name: updated.name,
          image: updated.image,
          createdAt: toIsoDateTime(updated.createdAt),
        }
      : null,
  )
})

members.delete("/:memberId", requirePermission("users.remove"), async (c) => {
  const memberId = c.req.param("memberId")
  const actor = c.get("user")
  const db = getDB()
  const target = await db.select().from(user).where(eq(user.id, memberId)).get()
  if (!target) return c.json({ code: "NOT_FOUND", message: "Member not found" }, 404)
  if (memberId === actor.id) {
    return c.json({ code: "FORBIDDEN", message: "You cannot remove your own account" }, 403)
  }

  const targetRole = normalizeWorkspaceRole(target.role)
  if (targetRole === "owner") {
    return c.json({ code: "OWNER_REQUIRED", message: "Cannot remove the bucket owner" }, 403)
  }
  if (!canManageWorkspaceRole(actor.role, targetRole)) {
    return c.json({ code: "ROLE_TOO_LOW", message: "Cannot remove this member role" }, 403)
  }

  await db.delete(user).where(eq(user.id, memberId)).run()
  await writeAudit(db, actor.id, "member.removed", memberId, {
    userId: target.id,
    role: target.role,
  })
  return c.json(RemoveMemberResponse.parse({ success: true, memberId }))
})

async function writeAudit(
  db: ReturnType<typeof getDB>,
  actorId: string,
  action: string,
  resourceId: string,
  metadata: Record<string, unknown>,
) {
  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      actorId,
      action,
      resourceType: "member",
      resourceId,
      metadata: JSON.stringify(metadata),
      createdAt: new Date().toISOString(),
    })
    .run()
}

function toIsoDateTime(value: string): string {
  const sqliteTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
  const normalized = sqliteTimestamp.test(value) ? `${value.replace(" ", "T")}Z` : value
  const date = new Date(normalized)

  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export const membersHandler = members
