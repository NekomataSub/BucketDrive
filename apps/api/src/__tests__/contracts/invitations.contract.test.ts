import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  AcceptInvitationResponse,
  InvitationDetailResponse,
  ListInvitationsResponse,
  RevokeInvitationResponse,
} from "@bucketdrive/shared"
import { createContractTestContext, expectApiError } from "./test-harness"

describe("invitations contracts", () => {
  it("lists, creates, reads, accepts, and revokes invitations", async () => {
    const ctx = createContractTestContext()
    const inviteeEmail = "contract-invitee@example.com"

    const create = await ctx.request(`/api/workspaces/${ctx.workspaceId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email: inviteeEmail, role: "viewer" }),
    })
    expect(create.status).toBe(201)
    const created = InvitationDetailResponse.extend({ inviteLink: z.string() }).parse(
      await ctx.json(create),
    )

    const list = await ctx.request(`/api/workspaces/${ctx.workspaceId}/invitations`)
    expect(list.status).toBe(200)
    ListInvitationsResponse.parse(await ctx.json(list))

    const token = new URL(created.inviteLink, "http://localhost:5173").searchParams.get("token")
    expect(token).toBeTruthy()

    const detail = await ctx.request(`/api/invitations/${String(token)}`, { userId: null })
    expect(detail.status).toBe(200)
    InvitationDetailResponse.parse(await ctx.json(detail))

    const invitee = ctx.seedUser({
      email: inviteeEmail,
      name: "Invitee",
      role: "guest",
    })

    const accept = await ctx.request(`/api/invitations/${String(token)}/accept`, {
      method: "POST",
      userId: invitee.id,
    })
    expect(accept.status).toBe(200)
    AcceptInvitationResponse.parse(await ctx.json(accept))

    const stale = ctx.seedInvitation({ email: "stale@example.com" })
    const revoke = await ctx.request(`/api/workspaces/${ctx.workspaceId}/invitations/${stale.id}`, {
      method: "DELETE",
    })
    expect(revoke.status).toBe(200)
    RevokeInvitationResponse.parse(await ctx.json(revoke))
  })

  it("enforces invitation RBAC and validation", async () => {
    const ctx = createContractTestContext()

    const denied = await ctx.request(`/api/workspaces/${ctx.workspaceId}/invitations`, {
      method: "POST",
      userId: ctx.viewer.id,
      body: JSON.stringify({ email: "denied@example.com", role: "viewer" }),
    })
    expect(denied.status).toBe(403)
    expectApiError(await ctx.json(denied))

    const invalid = await ctx.request(`/api/workspaces/${ctx.workspaceId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email: "bad", role: "viewer" }),
    })
    expect(invalid.status).toBe(400)
    expectApiError(await ctx.json(invalid))
  })

  it("expires stale invitations on read and allows a new invite for the same email", async () => {
    const ctx = createContractTestContext()
    const stale = ctx.seedInvitation({
      email: "expired@example.com",
      token: "expired-token",
      expiresAt: "2020-01-01T00:00:00.000Z",
    })

    const detail = await ctx.request(`/api/invitations/${stale.token}`, { userId: null })
    expect(detail.status).toBe(410)
    expectApiError(await ctx.json(detail))
    expect(
      ctx.sqlite.prepare("select status from bucket_invitation where id = ?").get(stale.id),
    ).toMatchObject({ status: "expired" })

    const create = await ctx.request(`/api/workspaces/${ctx.workspaceId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email: "expired@example.com", role: "viewer" }),
    })
    expect(create.status).toBe(201)
    InvitationDetailResponse.extend({ inviteLink: z.string() }).parse(await ctx.json(create))
  })

  it("accepting a lower-role invitation does not downgrade an existing higher-role user", async () => {
    const ctx = createContractTestContext()
    const invite = ctx.seedInvitation({
      email: ctx.admin.email,
      token: "admin-lower-role-token",
      role: "viewer",
    })

    const accept = await ctx.request(`/api/invitations/${invite.token}/accept`, {
      method: "POST",
      userId: ctx.admin.id,
    })
    expect(accept.status).toBe(200)
    const body = AcceptInvitationResponse.parse(await ctx.json(accept))
    expect(body.role).toBe("admin")
    expect(
      ctx.sqlite.prepare("select role from user where id = ?").get(ctx.admin.id),
    ).toMatchObject({ role: "admin" })
  })
})
