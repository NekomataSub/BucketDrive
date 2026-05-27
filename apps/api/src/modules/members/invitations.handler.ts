import { Hono } from "hono"
import { and, eq, gte } from "drizzle-orm"
import {
  AcceptInvitationResponse,
  CreateInvitationRequest,
  InvitationDetailResponse,
  InvitationListItemSchema,
  ListInvitationsResponse,
  RevokeInvitationResponse,
  type WorkspaceRole,
} from "@bucketdrive/shared"
import { workspaceInvitation, workspace, member, user } from "@bucketdrive/shared/db/schema"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { getDB } from "../../lib/db"
import {
  ensureOrganizationForWorkspace,
  syncMemberToLegacyWorkspaceMember,
  syncWorkspaceMemberships,
} from "../../lib/workspace-membership"
import { auditLog } from "@bucketdrive/shared/db/schema"
import { NotificationsService } from "../notifications/notifications.service"

interface InvitationsEnv {
  DB: D1Database
  APP_URL?: string
}

interface InvitationsVariables {
  user: { id: string; email: string; name: string }
  session: { id: string; userId: string; expiresAt: Date }
}

const INVITE_EXPIRY_DAYS = 7

function generateToken(): string {
  return crypto.randomUUID()
}

function getInviteLink(appUrl: string | undefined, token: string): string {
  const base = appUrl?.replace(/\/$/, "") ?? ""
  return `${base}/join?token=${token}`
}

const invitations = new Hono<{ Bindings: InvitationsEnv; Variables: InvitationsVariables }>()

invitations.use("*", authMiddleware)

invitations.get("/", requirePermission("users.invite"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const db = getDB()
  const now = new Date().toISOString()

  const rows = await db
    .select({
      id: workspaceInvitation.id,
      workspaceId: workspaceInvitation.workspaceId,
      email: workspaceInvitation.email,
      role: workspaceInvitation.role,
      invitedBy: workspaceInvitation.invitedBy,
      status: workspaceInvitation.status,
      expiresAt: workspaceInvitation.expiresAt,
      createdAt: workspaceInvitation.createdAt,
    })
    .from(workspaceInvitation)
    .where(
      and(
        eq(workspaceInvitation.workspaceId, workspaceId),
        eq(workspaceInvitation.status, "pending"),
        gte(workspaceInvitation.expiresAt, now),
      ),
    )
    .all()

  const inviterIds = [...new Set(rows.map((r) => r.invitedBy))]

  // Query all users and filter since inArray support varies across SQLite drivers
  const allInviters =
    inviterIds.length > 0
      ? await db.select({ id: user.id, name: user.name }).from(user).all()
      : []
  const inviterMap = new Map(allInviters.map((u) => [u.id, u.name]))

  const data = rows.map((row) =>
    InvitationListItemSchema.parse({
      ...row,
      invitedByName: inviterMap.get(row.invitedBy) ?? "Unknown",
    }),
  )

  return c.json(
    ListInvitationsResponse.parse({
      data,
      meta: { page: 1, limit: data.length || 1, total: data.length, totalPages: data.length > 0 ? 1 : 0 },
    }),
  )
})

invitations.post("/", requirePermission("users.invite"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const actor = c.get("user")
  const db = getDB()
  const body = CreateInvitationRequest.parse(await c.req.json())
  const appUrl = c.env.APP_URL

  await Promise.all([ensureOrganizationForWorkspace(db, workspaceId), syncWorkspaceMemberships(db, workspaceId)])

  // Check if already a member
  const existingMember = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, actor.id)))
    .get()

  if (!existingMember) {
    return c.json({ code: "WORKSPACE_ACCESS_DENIED", message: "Not a workspace member" }, 403)
  }

  // Check if email is already a member
  const targetUser = await db.select({ id: user.id }).from(user).where(eq(user.email, body.email.toLowerCase())).get()
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

  // Check for existing pending invitation for this email
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

  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  const token = generateToken()

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

  await db.insert(workspaceInvitation).values(createdInvitation).run()
  await writeInvitationAudit(db, {
    workspaceId,
    actorId: actor.id,
    action: "member.invited",
    resourceId: createdInvitation.id,
    metadata: { email: body.email, role: body.role },
  })

  const ws = await db.select({ name: workspace.name, slug: workspace.slug }).from(workspace).where(eq(workspace.id, workspaceId)).get()

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
      inviteLink: getInviteLink(appUrl, token),
    },
    201,
  )
})

invitations.delete("/:invitationId", requirePermission("users.invite"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const invitationId = c.req.param("invitationId")
  if (!workspaceId || !invitationId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and invitationId are required" }, 400)
  }

  const actor = c.get("user")
  const db = getDB()

  const target = await db
    .select()
    .from(workspaceInvitation)
    .where(and(eq(workspaceInvitation.id, invitationId), eq(workspaceInvitation.workspaceId, workspaceId)))
    .get()

  if (!target) {
    return c.json({ code: "NOT_FOUND", message: "Invitation not found" }, 404)
  }

  await db
    .update(workspaceInvitation)
    .set({ status: "revoked", updatedAt: new Date().toISOString() })
    .where(eq(workspaceInvitation.id, invitationId))
    .run()

  await writeInvitationAudit(db, {
    workspaceId,
    actorId: actor.id,
    action: "member.invitation_revoked",
    resourceId: invitationId,
    metadata: { email: target.email, role: target.role },
  })

  return c.json(RevokeInvitationResponse.parse({ success: true, invitationId }))
})

// Public endpoints (no auth required for GET by token)
const publicInvitations = new Hono<{ Bindings: InvitationsEnv }>()

publicInvitations.get("/:token", async (c) => {
  const token = c.req.param("token")
  const db = getDB()
  const now = new Date().toISOString()

  const invite = await db
    .select()
    .from(workspaceInvitation)
    .where(and(eq(workspaceInvitation.token, token), eq(workspaceInvitation.status, "pending")))
    .get()

  if (!invite) {
    return c.json({ code: "NOT_FOUND", message: "Invitation not found or already used" }, 404)
  }

  if (invite.expiresAt < now) {
    await db
      .update(workspaceInvitation)
      .set({ status: "expired", updatedAt: new Date().toISOString() })
      .where(eq(workspaceInvitation.id, invite.id))
      .run()
    return c.json({ code: "SHARE_EXPIRED", message: "Invitation has expired" }, 410)
  }

  const ws = await db.select({ name: workspace.name, slug: workspace.slug }).from(workspace).where(eq(workspace.id, invite.workspaceId)).get()
  const inviter = await db.select({ name: user.name }).from(user).where(eq(user.id, invite.invitedBy)).get()

  return c.json(
    InvitationDetailResponse.parse({
      id: invite.id,
      workspaceId: invite.workspaceId,
      workspaceName: ws?.name ?? "",
      workspaceSlug: ws?.slug ?? "",
      email: invite.email,
      role: invite.role,
      invitedByName: inviter?.name ?? "Unknown",
      status: invite.status,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    }),
  )
})

publicInvitations.post("/:token/accept", authMiddleware, async (c) => {
  const token = c.req.param("token")
  const user = c.get("user")
  const db = getDB()
  const now = new Date().toISOString()

  const invite = await db
    .select()
    .from(workspaceInvitation)
    .where(and(eq(workspaceInvitation.token, token), eq(workspaceInvitation.status, "pending")))
    .get()

  if (!invite) {
    return c.json({ code: "NOT_FOUND", message: "Invitation not found or already used" }, 404)
  }

  if (invite.expiresAt < now) {
    await db
      .update(workspaceInvitation)
      .set({ status: "expired", updatedAt: now })
      .where(eq(workspaceInvitation.id, invite.id))
      .run()
    return c.json({ code: "SHARE_EXPIRED", message: "Invitation has expired" }, 410)
  }

  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return c.json({ code: "FORBIDDEN", message: "This invitation is for a different email address" }, 403)
  }

  const workspaceId = invite.workspaceId

  await Promise.all([ensureOrganizationForWorkspace(db, workspaceId), syncWorkspaceMemberships(db, workspaceId)])

  // Check if already a member
  const existing = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, user.id)))
    .get()

  if (existing) {
    // Mark invitation as accepted anyway
    await db
      .update(workspaceInvitation)
      .set({ status: "accepted", acceptedAt: now, updatedAt: now })
      .where(eq(workspaceInvitation.id, invite.id))
      .run()
    return c.json(AcceptInvitationResponse.parse({ success: true, workspaceId, role: invite.role as WorkspaceRole }))
  }

  const createdAt = now
  const newMember = {
    id: crypto.randomUUID(),
    organizationId: workspaceId,
    userId: user.id,
    role: invite.role,
    createdAt,
  }

  await db.insert(member).values(newMember).run()
  await syncMemberToLegacyWorkspaceMember(db, workspaceId, user.id, invite.role as WorkspaceRole)

  await db
    .update(workspaceInvitation)
    .set({ status: "accepted", acceptedAt: now, updatedAt: now })
    .where(eq(workspaceInvitation.id, invite.id))
    .run()

  await writeInvitationAudit(db, {
    workspaceId,
    actorId: user.id,
    action: "member.joined",
    resourceId: newMember.id,
    metadata: { email: user.email, role: invite.role, invitationId: invite.id },
  })

  // Notify inviter that their invitation was accepted
  const notifications = new NotificationsService()
  const ws = await db.select({ name: workspace.name }).from(workspace).where(eq(workspace.id, workspaceId)).get()
  await notifications.createNotification({
    userId: invite.invitedBy,
    workspaceId,
    type: "member.joined",
    title: "Invitation accepted",
    message: `${user.name} (${user.email}) has accepted your invitation to join ${ws?.name ?? "the workspace"}.`,
    data: { invitationId: invite.id, memberId: newMember.id, workspaceId },
  })

  return c.json(
    AcceptInvitationResponse.parse({
      success: true,
      workspaceId,
      role: invite.role as WorkspaceRole,
    }),
  )
})

async function writeInvitationAudit(
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
      resourceType: "invitation",
      resourceId: params.resourceId,
      metadata: JSON.stringify(params.metadata),
      createdAt: new Date().toISOString(),
    })
    .run()
}

export const invitationsHandler = invitations
export const publicInvitationsHandler = publicInvitations
