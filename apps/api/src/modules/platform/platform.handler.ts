import { Hono } from "hono"
import { and, eq, gte } from "drizzle-orm"
import {
  PlatformSettingsResponse,
  UpdatePlatformSettingsRequest,
  UpdatePlatformSettingsResponse,
  PlatformJoinResponse,
  CreatePlatformInvitationRequest,
  ListPlatformInvitationsResponse,
  CreatePlatformInvitationResponse,
  AcceptPlatformInvitationResponse,
} from "@bucketdrive/shared"
import { platformSettings, member, workspaceInvitation, user as userSchema } from "@bucketdrive/shared/db/schema"
import { authMiddleware } from "../../middleware/auth"
import { requirePlatformAdmin } from "../../middleware/platform-admin"
import { getDB } from "../../lib/db"
import { ensureOrganizationForWorkspace, syncMemberToLegacyWorkspaceMember, syncWorkspaceMemberships } from "../../lib/workspace-membership"
import type { WorkspaceRole } from "@bucketdrive/shared"

interface PlatformEnv {
  DB: D1Database
  APP_URL?: string
}

interface PlatformVariables {
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean; canCreateWorkspaces: boolean }
}

const INVITE_EXPIRY_DAYS = 7

const platform = new Hono<{ Bindings: PlatformEnv; Variables: PlatformVariables }>()

// Protected: get current user platform info
platform.get("/me", authMiddleware, (c) => {
  const currentUser = c.get("user")
  return c.json({
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name,
    isPlatformAdmin: currentUser.isPlatformAdmin,
    canCreateWorkspaces: currentUser.canCreateWorkspaces,
  })
})

// Public: get platform settings
platform.get("/settings", async (c) => {
  const db = getDB()
  const settings = await db.select().from(platformSettings).get()

  if (!settings) {
    return c.json({
      platformName: "BucketDrive",
      defaultWorkspaceId: null,
      allowUserWorkspaceCreation: false,
      enablePublicSignup: true,
    })
  }

  return c.json(PlatformSettingsResponse.parse({
    platformName: settings.platformName,
    defaultWorkspaceId: settings.defaultWorkspaceId,
    allowUserWorkspaceCreation: settings.allowUserWorkspaceCreation,
    enablePublicSignup: settings.enablePublicSignup,
  }))
})

// Protected: update platform settings (platform admin only)
platform.patch("/settings", authMiddleware, requirePlatformAdmin, async (c) => {
  const db = getDB()
  const body = UpdatePlatformSettingsRequest.parse(await c.req.json())

  let settings = await db.select().from(platformSettings).get()
  const now = new Date().toISOString()

  if (!settings) {
    const newSettings = {
      id: crypto.randomUUID(),
      platformName: body.platformName ?? "BucketDrive",
      defaultWorkspaceId: body.defaultWorkspaceId ?? null,
      allowUserWorkspaceCreation: body.allowUserWorkspaceCreation ?? false,
      enablePublicSignup: body.enablePublicSignup ?? true,
      createdAt: now,
      updatedAt: now,
    }
    await db.insert(platformSettings).values(newSettings).run()
    settings = newSettings
  } else {
    await db
      .update(platformSettings)
      .set({
        platformName: body.platformName ?? settings.platformName,
        defaultWorkspaceId: body.defaultWorkspaceId !== undefined ? body.defaultWorkspaceId : settings.defaultWorkspaceId,
        allowUserWorkspaceCreation: body.allowUserWorkspaceCreation ?? settings.allowUserWorkspaceCreation,
        enablePublicSignup: body.enablePublicSignup ?? settings.enablePublicSignup,
        updatedAt: now,
      })
      .where(eq(platformSettings.id, settings.id))
      .run()
    settings = await db.select().from(platformSettings).get()
  }

  if (!settings) {
    return c.json({ code: "INTERNAL_ERROR", message: "Failed to retrieve platform settings" }, 500)
  }

  return c.json(UpdatePlatformSettingsResponse.parse({
    success: true,
    settings: {
      platformName: settings.platformName,
      defaultWorkspaceId: settings.defaultWorkspaceId,
      allowUserWorkspaceCreation: settings.allowUserWorkspaceCreation,
      enablePublicSignup: settings.enablePublicSignup,
    },
  }))
})

// Protected: join default workspace (auto-add user to platform default workspace)
platform.post("/join", authMiddleware, async (c) => {
  const currentUser = c.get("user")
  const db = getDB()

  const settings = await db.select().from(platformSettings).get()
  if (!settings || !settings.defaultWorkspaceId) {
    return c.json({ code: "NOT_FOUND", message: "No default workspace configured" }, 404)
  }

  const workspaceId = settings.defaultWorkspaceId

  await Promise.all([ensureOrganizationForWorkspace(db, workspaceId), syncWorkspaceMemberships(db, workspaceId)])

  // Check if already a member
  const existing = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, currentUser.id)))
    .get()

  if (existing) {
    const existingRole = await db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, workspaceId), eq(member.userId, currentUser.id)))
      .get()
    return c.json(PlatformJoinResponse.parse({
      success: true,
      workspaceId,
      role: (existingRole?.role ?? "viewer") as WorkspaceRole,
    }))
  }

  const now = new Date().toISOString()
  const newMember = {
    id: crypto.randomUUID(),
    organizationId: workspaceId,
    userId: currentUser.id,
    role: "viewer" as const,
    createdAt: now,
  }

  await db.insert(member).values(newMember).run()
  await syncMemberToLegacyWorkspaceMember(db, workspaceId, currentUser.id, "viewer")

  return c.json(PlatformJoinResponse.parse({
    success: true,
    workspaceId,
    role: "viewer",
  }))
})

// Protected: create platform invitation (platform admin only)
platform.post("/invitations", authMiddleware, requirePlatformAdmin, async (c) => {
  const actor = c.get("user")
  const db = getDB()
  const body = CreatePlatformInvitationRequest.parse(await c.req.json())
  const appUrl = c.env.APP_URL

  const settings = await db.select().from(platformSettings).get()
  if (!settings || !settings.defaultWorkspaceId) {
    return c.json({ code: "NOT_FOUND", message: "No default workspace configured" }, 404)
  }

  const workspaceId = settings.defaultWorkspaceId
  await Promise.all([ensureOrganizationForWorkspace(db, workspaceId), syncWorkspaceMemberships(db, workspaceId)])

  // Check if email is already a member
  const targetUser = await db.select({ id: userSchema.id }).from(userSchema).where(eq(userSchema.email, body.email.toLowerCase())).get()
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
  const token = crypto.randomUUID()

  const createdInvitation = {
    id: crypto.randomUUID(),
    workspaceId,
    email: body.email.toLowerCase(),
    token,
    role: body.role,
    canCreateWorkspaces: body.canCreateWorkspaces,
    invitedBy: actor.id,
    status: "pending" as const,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }

  await db.insert(workspaceInvitation).values(createdInvitation).run()

  const base = appUrl?.replace(/\/$/, "") ?? ""
  const inviteLink = `${base}/join?token=${token}`

  return c.json(CreatePlatformInvitationResponse.parse({
    id: createdInvitation.id,
    email: createdInvitation.email,
    role: createdInvitation.role,
    canCreateWorkspaces: createdInvitation.canCreateWorkspaces,
    status: createdInvitation.status,
    expiresAt: createdInvitation.expiresAt,
    createdAt: createdInvitation.createdAt,
    inviteLink,
  }), 201)
})

// Protected: list platform invitations (platform admin only)
platform.get("/invitations", authMiddleware, requirePlatformAdmin, async (c) => {
  const db = getDB()
  const now = new Date().toISOString()

  const settings = await db.select().from(platformSettings).get()
  if (!settings || !settings.defaultWorkspaceId) {
    return c.json(ListPlatformInvitationsResponse.parse({ data: [] }))
  }

  const rows = await db
    .select({
      id: workspaceInvitation.id,
      email: workspaceInvitation.email,
      token: workspaceInvitation.token,
      role: workspaceInvitation.role,
      canCreateWorkspaces: workspaceInvitation.canCreateWorkspaces,
      status: workspaceInvitation.status,
      expiresAt: workspaceInvitation.expiresAt,
      createdAt: workspaceInvitation.createdAt,
    })
    .from(workspaceInvitation)
    .where(
      and(
        eq(workspaceInvitation.workspaceId, settings.defaultWorkspaceId),
        eq(workspaceInvitation.status, "pending"),
        gte(workspaceInvitation.expiresAt, now),
      ),
    )
    .all()

  const base = c.env.APP_URL?.replace(/\/$/, "") ?? ""
  const data = rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    canCreateWorkspaces: row.canCreateWorkspaces,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    inviteLink: `${base}/join?token=${row.token}`,
  }))

  return c.json(ListPlatformInvitationsResponse.parse({ data }))
})

// Public: accept platform invitation
platform.post("/invitations/:token/accept", authMiddleware, async (c) => {
  const token = c.req.param("token")
  const currentUser = c.get("user")
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

  if (invite.email.toLowerCase() !== currentUser.email.toLowerCase()) {
    return c.json({ code: "FORBIDDEN", message: "This invitation is for a different email address" }, 403)
  }

  const workspaceId = invite.workspaceId

  await Promise.all([ensureOrganizationForWorkspace(db, workspaceId), syncWorkspaceMemberships(db, workspaceId)])

  // Check if already a member
  const existing = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, currentUser.id)))
    .get()

  if (existing) {
    await db
      .update(workspaceInvitation)
      .set({ status: "accepted", acceptedAt: now, updatedAt: now })
      .where(eq(workspaceInvitation.id, invite.id))
      .run()
  } else {
    const createdAt = now
    const newMember = {
      id: crypto.randomUUID(),
      organizationId: workspaceId,
      userId: currentUser.id,
      role: invite.role,
      createdAt,
    }

    await db.insert(member).values(newMember).run()
    await syncMemberToLegacyWorkspaceMember(db, workspaceId, currentUser.id, invite.role as WorkspaceRole)

    await db
      .update(workspaceInvitation)
      .set({ status: "accepted", acceptedAt: now, updatedAt: now })
      .where(eq(workspaceInvitation.id, invite.id))
      .run()
  }

  // Update user canCreateWorkspaces if invitation allows it
  if (invite.canCreateWorkspaces) {
    await db
      .update(userSchema)
      .set({ canCreateWorkspaces: true })
      .where(eq(userSchema.id, currentUser.id))
      .run()
  }

  return c.json(AcceptPlatformInvitationResponse.parse({
    success: true,
    workspaceId,
    role: invite.role as WorkspaceRole,
  }))
})

export const platformHandler = platform
