import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  InvitationDetailResponse,
  ListMembersResponse,
  OwnershipTransferResponse,
  RemoveMemberResponse,
  WorkspaceMemberListItemSchema,
} from "@bucketdrive/shared"
import { createContractTestContext, expectApiError } from "./test-harness"

describe("members contracts", () => {
  it("lists members, creates invitations, updates roles, and removes members", async () => {
    const ctx = createContractTestContext()
    const target = ctx.seedUser({
      id: "better-auth-editor-id",
      email: "editor@example.com",
      name: "Editor",
      role: "editor",
    })

    const list = await ctx.request(`/api/workspaces/${ctx.workspaceId}/members`)
    expect(list.status).toBe(200)
    const members = ListMembersResponse.parse(await ctx.json(list))
    const targetMember = members.data.find((entry) => entry.userId === target.id)
    if (!targetMember) {
      throw new Error("Expected seeded member in list response")
    }

    const invite = await ctx.request(`/api/workspaces/${ctx.workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify({ email: "new-member@example.com", role: "viewer" }),
    })
    expect(invite.status).toBe(201)
    InvitationDetailResponse.extend({ inviteLink: z.string() }).parse(await ctx.json(invite))

    const update = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/members/${targetMember.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: "manager" }),
      },
    )
    expect(update.status).toBe(200)
    WorkspaceMemberListItemSchema.parse(await ctx.json(update))

    const remove = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/members/${targetMember.id}`,
      {
        method: "DELETE",
      },
    )
    expect(remove.status).toBe(200)
    RemoveMemberResponse.parse(await ctx.json(remove))
  })

  it("normalizes SQLite timestamps when listing members", async () => {
    const ctx = createContractTestContext()
    const target = ctx.seedUser({ email: "sqlite-date@example.com", name: "SQLite Date" })
    ctx.sqlite
      .prepare("update user set created_at = ? where id = ?")
      .run("2026-06-06 10:00:00", target.id)

    const list = await ctx.request(`/api/workspaces/${ctx.workspaceId}/members`)
    expect(list.status).toBe(200)
    const members = ListMembersResponse.parse(await ctx.json(list))
    const targetMember = members.data.find((entry) => entry.userId === target.id)

    expect(targetMember?.createdAt).toBe("2026-06-06T10:00:00.000Z")
  })

  it("enforces member RBAC and validation", async () => {
    const ctx = createContractTestContext()

    const denied = await ctx.request(`/api/workspaces/${ctx.workspaceId}/members`, {
      method: "POST",
      userId: ctx.viewer.id,
      body: JSON.stringify({ email: "blocked@example.com", role: "viewer" }),
    })
    expect(denied.status).toBe(403)
    expectApiError(await ctx.json(denied))

    const invalid = await ctx.request(`/api/workspaces/${ctx.workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email", role: "viewer" }),
    })
    expect(invalid.status).toBe(400)
    expectApiError(await ctx.json(invalid))
  })

  it("enforces role hierarchy and self-management guards", async () => {
    const ctx = createContractTestContext()
    const adminPeer = ctx.seedUser({
      email: "admin-peer@example.com",
      name: "Admin Peer",
      role: "admin",
    })

    const selfUpdate = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/members/${ctx.owner.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: "admin" }),
      },
    )
    expect(selfUpdate.status).toBe(403)
    expectApiError(await ctx.json(selfUpdate))

    const selfRemove = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/members/${ctx.owner.id}`,
      {
        method: "DELETE",
      },
    )
    expect(selfRemove.status).toBe(403)
    expectApiError(await ctx.json(selfRemove))

    const peerUpdate = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/members/${adminPeer.id}`,
      {
        method: "PATCH",
        userId: ctx.admin.id,
        body: JSON.stringify({ role: "manager" }),
      },
    )
    expect(peerUpdate.status).toBe(403)
    expectApiError(await ctx.json(peerUpdate))

    const ownerRole = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/members/${ctx.admin.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: "owner" }),
      },
    )
    expect(ownerRole.status).toBe(400)
    expectApiError(await ctx.json(ownerRole))
  })

  it("transfers ownership from the owner to an admin", async () => {
    const ctx = createContractTestContext()

    const transfer = await ctx.request(`/api/workspaces/${ctx.workspaceId}/transfer-ownership`, {
      method: "POST",
      body: JSON.stringify({ newOwnerId: ctx.admin.id }),
    })
    expect(transfer.status).toBe(200)
    OwnershipTransferResponse.parse(await ctx.json(transfer))

    expect(
      ctx.sqlite.prepare("select role from user where id = ?").get(ctx.owner.id),
    ).toMatchObject({
      role: "admin",
    })
    expect(
      ctx.sqlite.prepare("select role from user where id = ?").get(ctx.admin.id),
    ).toMatchObject({
      role: "owner",
    })
  })
})
