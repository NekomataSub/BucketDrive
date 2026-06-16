import { and, eq, gte, sql } from "drizzle-orm"
import {
  compareWorkspaceRoles,
  normalizeWorkspaceRole,
  type WorkspaceRole,
} from "@bucketdrive/shared"
import { auditLog, bucketInvitation, user } from "@bucketdrive/shared/db/schema"
import type { getDB } from "../../lib/db"

type DB = ReturnType<typeof getDB>

interface InvitationActor {
  id: string
  name: string
}

export interface InvitationServiceError {
  status: 400 | 403 | 404 | 409 | 410
  body: {
    code: string
    message: string
  }
}

type InvitationRow = typeof bucketInvitation.$inferSelect
type InvitationDetail = ReturnType<typeof toInvitationDetail>
type ServiceResult<T> = { data: T; raw: InvitationRow } | { error: InvitationServiceError }

export function inviteLink(appUrl: string | undefined, token: string): string {
  const base = appUrl?.replace(/\/$/, "") ?? ""
  return `${base}/join?token=${token}`
}

export async function listPendingInvitations(db: DB) {
  return db
    .select({
      id: bucketInvitation.id,
      email: bucketInvitation.email,
      role: bucketInvitation.role,
      invitedBy: bucketInvitation.invitedBy,
      status: bucketInvitation.status,
      expiresAt: bucketInvitation.expiresAt,
      createdAt: bucketInvitation.createdAt,
      token: bucketInvitation.token,
    })
    .from(bucketInvitation)
    .where(
      and(
        eq(bucketInvitation.status, "pending"),
        gte(bucketInvitation.expiresAt, new Date().toISOString()),
      ),
    )
    .all()
}

export async function getUserNamesById(db: DB): Promise<Map<string, string>> {
  const users = await db.select({ id: user.id, name: user.name }).from(user).all()
  return new Map(users.map((row) => [row.id, row.name]))
}

export async function createInvitation(
  db: DB,
  actor: InvitationActor,
  input: { email: string; role: Exclude<WorkspaceRole, "owner"> },
  appUrl: string | undefined,
): Promise<ServiceResult<InvitationDetail & { inviteLink: string }>> {
  const email = input.email.toLowerCase()
  const targetUser = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(sql`lower(${user.email})`, email))
    .get()

  if (targetUser) {
    return {
      error: {
        status: 409,
        body: { code: "USER_ALREADY_MEMBER", message: "User already exists" },
      },
    }
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const existingInvite = await db
    .select()
    .from(bucketInvitation)
    .where(and(eq(bucketInvitation.email, email), eq(bucketInvitation.status, "pending")))
    .get()

  if (existingInvite && existingInvite.expiresAt >= nowIso) {
    return {
      error: {
        status: 409,
        body: { code: "CONFLICT", message: "Pending invitation already exists for this email" },
      },
    }
  }

  if (existingInvite) {
    await db
      .update(bucketInvitation)
      .set({ status: "expired", updatedAt: nowIso })
      .where(eq(bucketInvitation.id, existingInvite.id))
      .run()
  }

  const token = crypto.randomUUID()
  const created = {
    id: crypto.randomUUID(),
    email,
    token,
    role: input.role,
    invitedBy: actor.id,
    status: "pending",
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    acceptedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  }

  await db.insert(bucketInvitation).values(created).run()
  await writeInvitationAudit(db, actor.id, "member.invited", created.id, {
    email,
    role: input.role,
  })

  return {
    raw: created,
    data: {
      ...toInvitationDetail(created, actor.name),
      inviteLink: inviteLink(appUrl, token),
    },
  }
}

export async function readInvitationByToken(
  db: DB,
  token: string,
): Promise<ServiceResult<InvitationDetail>> {
  const invite = await db
    .select()
    .from(bucketInvitation)
    .where(eq(bucketInvitation.token, token))
    .get()
  if (!invite) {
    return {
      error: {
        status: 404,
        body: { code: "NOT_FOUND", message: "Invitation not found" },
      },
    } satisfies { error: InvitationServiceError }
  }

  const now = new Date().toISOString()
  if (invite.status === "pending" && invite.expiresAt < now) {
    await db
      .update(bucketInvitation)
      .set({ status: "expired", updatedAt: now })
      .where(eq(bucketInvitation.id, invite.id))
      .run()
    return {
      error: {
        status: 410,
        body: { code: "SHARE_EXPIRED", message: "Invitation has expired" },
      },
    } satisfies { error: InvitationServiceError }
  }

  const inviter = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, invite.invitedBy))
    .get()

  return {
    data: toInvitationDetail(invite, inviter?.name ?? "Unknown"),
    raw: invite,
  }
}

export async function acceptInvitation(
  db: DB,
  token: string,
  currentUser: { id: string; email: string; role: WorkspaceRole },
): Promise<ServiceResult<{ success: true; role: WorkspaceRole }>> {
  const now = new Date().toISOString()
  const invite = await db
    .select()
    .from(bucketInvitation)
    .where(and(eq(bucketInvitation.token, token), eq(bucketInvitation.status, "pending")))
    .get()

  if (!invite) {
    return {
      error: {
        status: 404,
        body: { code: "NOT_FOUND", message: "Invitation not found or already used" },
      },
    } satisfies { error: InvitationServiceError }
  }

  if (invite.expiresAt < now) {
    await db
      .update(bucketInvitation)
      .set({ status: "expired", updatedAt: now })
      .where(eq(bucketInvitation.id, invite.id))
      .run()
    return {
      error: {
        status: 410,
        body: { code: "SHARE_EXPIRED", message: "Invitation has expired" },
      },
    } satisfies { error: InvitationServiceError }
  }

  if (invite.email.toLowerCase() !== currentUser.email.toLowerCase()) {
    return {
      error: {
        status: 403,
        body: { code: "FORBIDDEN", message: "This invitation is for a different email address" },
      },
    } satisfies { error: InvitationServiceError }
  }

  const invitedRole = normalizeWorkspaceRole(invite.role)
  const currentRole = normalizeWorkspaceRole(currentUser.role)
  const effectiveRole =
    compareWorkspaceRoles(invitedRole, currentRole) > 0 ? invitedRole : currentRole

  if (effectiveRole !== currentRole) {
    await db
      .update(user)
      .set({ role: effectiveRole, updatedAt: now })
      .where(eq(user.id, currentUser.id))
      .run()
  }

  await db
    .update(bucketInvitation)
    .set({ status: "accepted", acceptedAt: now, updatedAt: now })
    .where(eq(bucketInvitation.id, invite.id))
    .run()
  await writeInvitationAudit(db, currentUser.id, "member.joined", currentUser.id, {
    role: effectiveRole,
  })

  return { data: { success: true as const, role: effectiveRole }, raw: invite }
}

export function toInvitationDetail(
  invite: Pick<
    typeof bucketInvitation.$inferSelect,
    "id" | "email" | "role" | "invitedBy" | "status" | "expiresAt" | "createdAt"
  >,
  invitedByName: string,
) {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role as WorkspaceRole,
    invitedBy: invite.invitedBy,
    invitedByName,
    status: invite.status,
    expiresAt: toIsoDateTime(invite.expiresAt),
    createdAt: toIsoDateTime(invite.createdAt),
  }
}

export function toIsoDateTime(value: string): string {
  const sqliteTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
  const normalized = sqliteTimestamp.test(value) ? `${value.replace(" ", "T")}Z` : value
  const date = new Date(normalized)

  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export async function writeInvitationAudit(
  db: DB,
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
