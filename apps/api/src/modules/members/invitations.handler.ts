import { Hono } from "hono"
import {
  AcceptInvitationResponse,
  CreateInvitationResponse,
  CreateInvitationRequest,
  InvitationDetailResponse,
  InvitationListItemSchema,
  ListInvitationsResponse,
  RevokeInvitationResponse,
  canAssignWorkspaceRole,
  type WorkspaceRole,
} from "@bucketdrive/shared"
import { eq } from "drizzle-orm"
import { bucketInvitation } from "@bucketdrive/shared/db/schema"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { getDB } from "../../lib/db"
import {
  acceptInvitation,
  createInvitation,
  getUserNamesById,
  inviteLink,
  listPendingInvitations,
  readInvitationByToken,
  writeInvitationAudit,
} from "./invitation-service"

interface InvitationsEnv {
  DB: D1Database
  APP_URL?: string
}

interface InvitationsVariables {
  user: { id: string; email: string; name: string; role: WorkspaceRole }
  session: { id: string; userId: string; expiresAt: Date }
}

const invitations = new Hono<{ Bindings: InvitationsEnv; Variables: InvitationsVariables }>()
const publicInvitations = new Hono<{ Bindings: InvitationsEnv; Variables: InvitationsVariables }>()

invitations.use("*", authMiddleware)

invitations.get("/", requirePermission("users.invite"), async (c) => {
  const db = getDB()
  const rows = await listPendingInvitations(db)
  const userNameById = await getUserNamesById(db)
  const data = rows.map((row) =>
    InvitationListItemSchema.parse({
      ...row,
      invitedByName: userNameById.get(row.invitedBy) ?? "Unknown",
      inviteLink: inviteLink(c.env.APP_URL, row.token),
    }),
  )
  return c.json(
    ListInvitationsResponse.parse({
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

invitations.post("/", requirePermission("users.invite"), async (c) => {
  const actor = c.get("user")
  const db = getDB()
  const body = CreateInvitationRequest.parse(await c.req.json())
  if (!canAssignWorkspaceRole(actor.role, body.role)) {
    return c.json({ code: "ROLE_TOO_LOW", message: "Cannot invite a role above your own" }, 403)
  }

  const result = await createInvitation(db, actor, body, c.env.APP_URL)
  if ("error" in result) return c.json(result.error.body, result.error.status)

  return c.json(CreateInvitationResponse.parse(result.data), 201)
})

invitations.delete("/:invitationId", requirePermission("users.invite"), async (c) => {
  const actor = c.get("user")
  const db = getDB()
  const invitationId = c.req.param("invitationId")
  const target = await db
    .select()
    .from(bucketInvitation)
    .where(eq(bucketInvitation.id, invitationId))
    .get()
  if (!target) return c.json({ code: "NOT_FOUND", message: "Invitation not found" }, 404)
  await db
    .update(bucketInvitation)
    .set({ status: "revoked", updatedAt: new Date().toISOString() })
    .where(eq(bucketInvitation.id, invitationId))
    .run()
  await writeInvitationAudit(db, actor.id, "member.invitation_revoked", invitationId, {
    email: target.email,
    role: target.role,
  })
  return c.json(RevokeInvitationResponse.parse({ success: true, invitationId }))
})

publicInvitations.get("/:token", async (c) => {
  const result = await readInvitationByToken(getDB(), c.req.param("token"))
  if ("error" in result) return c.json(result.error.body, result.error.status)

  return c.json(InvitationDetailResponse.parse(result.data))
})

publicInvitations.post("/:token/accept", authMiddleware, async (c) => {
  const result = await acceptInvitation(getDB(), c.req.param("token"), c.get("user"))
  if ("error" in result) return c.json(result.error.body, result.error.status)

  return c.json(AcceptInvitationResponse.parse(result.data))
})

export const invitationsHandler = invitations
export const publicInvitationsHandler = publicInvitations
