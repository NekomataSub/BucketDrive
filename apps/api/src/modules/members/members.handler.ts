import { Hono } from "hono"
import { and, eq } from "drizzle-orm"
import {
  AddMemberRequest,
  ListMembersResponse,
  RemoveMemberResponse,
  UpdateMemberRoleRequest,
} from "@bucketdrive/shared"
import { auditLog, member, user, workspaceInvitation, workspace } from "@bucketdrive/shared/db/schema"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { getDB } from "../../lib/db"
import { NotificationsService } from "../notifications/notifications.service"
import {
  ensureOrganizationForWorkspace,
  listWorkspaceMembersWithUsers,
  removeLegacyWorkspaceMember,
  syncMemberToLegacyWorkspaceMember,
  syncWorkspaceMemberships,
} from "../../lib/workspace-membership"

interface MembersEnv {
  DB: D1Database
  APP_URL?: string
}

interface MembersVariables {
  user: { id: string; email: string; name: string }
  session: { id: string; userId: string; expiresAt: Date }
}

const members = new Hono<{ Bindings: MembersEnv; Variables: MembersVariables }>()

members.use("*", authMiddleware)

function hasOwnerRole(role: string): boolean {
  return role.split(",").includes("owner")
}

members.get("/", requirePermission("users.read"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const rows = await listWorkspaceMembersWithUsers(getDB(), workspaceId)

  return c.json(
    ListMembersResponse.parse({
      data: rows,
      meta: {
        page: 1,
        limit: rows.length || 1,
        total: rows.length,
        totalPages: rows.length > 0 ? 1 : 0,
      },
    }),
  )
})

members.post("/", requirePermission("users.invite"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const actor = c.get("user")
  const db = getDB()
  const body = AddMemberRequest.parse(await c.req.json())
  const appUrl = c.env.APP_URL

  await Promise.all([ensureOrganizationForWorkspace(db, workspaceId), syncWorkspaceMemberships(db, workspaceId)])

  // Check if already a member
  const targetUser = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, body.email.toLowerCase()))
    .get()

  if (targetUser) {
    const alreadyMember = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, workspaceId), eq(member.userId, targetUser.id)))
      .get()
    if (alreadyMember) {
      return c.json({ code: "USER_ALREADY_MEMBER", message: "User is already a member" }, 409)
    }
  }

  // Check for existing pending invitation
  const existingInvite = await db
    .select({ id: workspaceInvitation.id })
    .from(workspaceInvitation)
    .where(
      and(
        eq(workspaceInvitation.workspaceId, workspaceId),
        eq(workspaceInvitation.email, body.email.toLowerCase()),
        eq(workspaceInvitation.status, "pending"),
      ),
    )
    .get()

  if (existingInvite) {
    return c.json({ code: "CONFLICT", message: "Pending invitation already exists for this email" }, 409)
  }

  const INVITE_EXPIRY_DAYS = 7
  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  const token = crypto.randomUUID()

  const createdInvitation = {
    id: crypto.randomUUID(),
    workspaceId,
    email: body.email.toLowerCase(),
    token,
    role: body.role,
    invitedBy: actor.id,
    status: "pending" as const,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }

  const ws = await db
    .select({ name: workspace.name, slug: workspace.slug })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .get()

  await db.insert(workspaceInvitation).values(createdInvitation).run()
  await writeMemberAudit(db, {
    workspaceId,
    actorId: actor.id,
    action: "member.invited",
    resourceId: createdInvitation.id,
    metadata: {
      email: body.email,
      role: body.role,
    },
  })

  // Notify invited user if they already have an account
  if (targetUser) {
    const notifications = new NotificationsService()
    await notifications.createNotification({
      userId: targetUser.id,
      workspaceId,
      type: "member.invited",
      title: "Workspace invitation",
      message: `You have been invited to join ${ws?.name ?? "a workspace"} as ${body.role}.`,
      data: { invitationId: createdInvitation.id, workspaceId, role: body.role },
    })
  }

  const baseUrl = appUrl?.replace(/\/$/, "") ?? ""
  const inviteLink = `${baseUrl}/join?token=${token}`

  return c.json(
    {
      id: createdInvitation.id,
      workspaceId,
      workspaceName: ws?.name ?? "",
      workspaceSlug: ws?.slug ?? "",
      email: createdInvitation.email,
      role: createdInvitation.role,
      invitedByName: actor.name,
      status: createdInvitation.status,
      expiresAt: createdInvitation.expiresAt,
      createdAt: createdInvitation.createdAt,
      inviteLink,
    },
    201,
  )
})

members.patch("/:memberId", requirePermission("users.update_roles"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const memberId = c.req.param("memberId")
  if (!workspaceId || !memberId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and memberId are required" }, 400)
  }

  const actor = c.get("user")
  const db = getDB()
  const body = UpdateMemberRoleRequest.parse(await c.req.json())

  await syncWorkspaceMemberships(db, workspaceId)

  const target = await db
    .select()
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, workspaceId)))
    .get()

  if (!target) {
    return c.json({ code: "NOT_FOUND", message: "Member not found" }, 404)
  }

  if (hasOwnerRole(target.role) && !hasOwnerRole(body.role)) {
    const ownerCount = await countOwners(db, workspaceId)
    if (ownerCount <= 1) {
      return c.json({ code: "FORBIDDEN", message: "Cannot demote the last owner" }, 403)
    }
  }

  await db.update(member).set({ role: body.role }).where(eq(member.id, memberId)).run()
  await syncMemberToLegacyWorkspaceMember(db, workspaceId, target.userId, body.role)
  await writeMemberAudit(db, {
    workspaceId,
    actorId: actor.id,
    action: "member.role_updated",
    resourceId: memberId,
    metadata: {
      previousRole: target.role,
      role: body.role,
      userId: target.userId,
    },
  })

  const rows = await listWorkspaceMembersWithUsers(db, workspaceId)
  const updated = rows.find((entry) => entry.id === memberId)
  return c.json(updated)
})

members.delete("/:memberId", requirePermission("users.remove"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const memberId = c.req.param("memberId")
  if (!workspaceId || !memberId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and memberId are required" }, 400)
  }

  const actor = c.get("user")
  const db = getDB()

  await syncWorkspaceMemberships(db, workspaceId)

  const target = await db
    .select()
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, workspaceId)))
    .get()

  if (!target) {
    return c.json({ code: "NOT_FOUND", message: "Member not found" }, 404)
  }

  if (hasOwnerRole(target.role)) {
    const ownerCount = await countOwners(db, workspaceId)
    if (ownerCount <= 1) {
      return c.json({ code: "FORBIDDEN", message: "Cannot remove the last owner" }, 403)
    }
  }

  await db.delete(member).where(eq(member.id, memberId)).run()
  await removeLegacyWorkspaceMember(db, workspaceId, target.userId)
  await writeMemberAudit(db, {
    workspaceId,
    actorId: actor.id,
    action: "member.removed",
    resourceId: memberId,
    metadata: {
      userId: target.userId,
      role: target.role,
    },
  })

  return c.json(RemoveMemberResponse.parse({ success: true, memberId }))
})

async function countOwners(db: ReturnType<typeof getDB>, workspaceId: string) {
  const rows = await db
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(eq(member.organizationId, workspaceId))
    .all()

  return rows.filter((row) => hasOwnerRole(row.role)).length
}

async function writeMemberAudit(
  db: ReturnType<typeof getDB>,
  params: {
    workspaceId: string
    actorId: string
    action: string
    resourceId: string
    metadata: Record<string, unknown>
  },
) {
  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      workspaceId: params.workspaceId,
      actorId: params.actorId,
      action: params.action,
      resourceType: "member",
      resourceId: params.resourceId,
      metadata: JSON.stringify(params.metadata),
      createdAt: new Date().toISOString(),
    })
    .run()
}

export const membersHandler = members
