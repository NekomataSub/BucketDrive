import { describe, expect, it } from "vitest"
import {
  AcceptPlatformInvitationResponse,
  CreatePlatformInvitationResponse,
  ListPlatformInvitationsResponse,
  PlatformJoinResponse,
  PlatformSettingsResponse,
  UploadPlatformAssetResponse,
  UpdatePlatformSettingsResponse,
} from "@bucketdrive/shared"
import { createContractTestContext, expectApiError } from "./test-harness"

describe("platform contracts", () => {
  it("returns user info, updates settings, and joins the bucket", async () => {
    const ctx = createContractTestContext()

    const me = await ctx.request("/api/platform/me")
    expect(me.status).toBe(200)
    expect(await ctx.json(me)).toMatchObject({ id: ctx.owner.id, isPlatformAdmin: true })

    const settings = await ctx.request("/api/platform/settings", {
      method: "PATCH",
      body: JSON.stringify({ platformName: "BucketDrive Test", defaultLanguage: "pt-BR" }),
    })
    expect(settings.status).toBe(200)
    const updatedSettings = UpdatePlatformSettingsResponse.parse(await ctx.json(settings))
    expect(updatedSettings.settings.defaultLanguage).toBe("pt-BR")

    const readSettings = await ctx.request("/api/platform/settings", { userId: null })
    expect(readSettings.status).toBe(200)
    const parsedReadSettings = PlatformSettingsResponse.parse(await ctx.json(readSettings))
    expect(parsedReadSettings.platformName).toBe("BucketDrive Test")
    expect(parsedReadSettings.defaultLanguage).toBe("pt-BR")

    const workspaces = await ctx.request("/api/workspaces")
    expect(workspaces.status).toBe(200)
    const workspaceBody = await ctx.json<{ data: Array<{ id: string; name: string }> }>(workspaces)
    expect(workspaceBody.data).toContainEqual(
      expect.objectContaining({ id: ctx.bucketId, name: "BucketDrive Test" }),
    )
    expect(
      ctx.sqlite.prepare("select name from bucket where id = ?").get(ctx.bucketId),
    ).toMatchObject({ name: "BucketDrive Test" })
    expect(ctx.sqlite.prepare("select count(*) as count from bucket").get()).toMatchObject({
      count: 1,
    })

    const join = await ctx.request("/api/platform/join", {
      method: "POST",
      userId: ctx.outsider.id,
    })
    expect(join.status).toBe(200)
    PlatformJoinResponse.parse(await ctx.json(join))
  })

  it("uploads and serves platform branding assets", async () => {
    const ctx = createContractTestContext()
    const form = new FormData()
    form.set("file", new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" }))

    const upload = await ctx.request("/api/platform/assets/logo", {
      method: "POST",
      body: form,
    })
    expect(upload.status).toBe(200)
    const uploadBody = UploadPlatformAssetResponse.parse(await ctx.json(upload))
    expect(uploadBody.settings.platformLogoUrl).toMatch(/^\/api\/platform\/assets\/logo/)

    const asset = await ctx.request("/api/platform/assets/logo", { userId: null })
    expect(asset.status).toBe(200)
    expect(asset.headers.get("content-type")).toContain("image/png")
  })

  it("lists, creates, and accepts platform invitations", async () => {
    const ctx = createContractTestContext()

    const create = await ctx.request("/api/platform/invitations", {
      method: "POST",
      body: JSON.stringify({ email: "platform-invitee@example.com", role: "editor" }),
    })
    expect(create.status).toBe(201)
    const created = CreatePlatformInvitationResponse.parse(await ctx.json(create))
    expect(created.inviteLink).toContain("/join?token=")

    const list = await ctx.request("/api/platform/invitations")
    expect(list.status).toBe(200)
    const invitations = ListPlatformInvitationsResponse.parse(await ctx.json(list))
    expect(invitations.data.some((entry) => entry.id === created.id)).toBe(true)

    const token = new URL(created.inviteLink, "http://localhost:5173").searchParams.get("token")
    const invitee = ctx.seedUser({
      email: "platform-invitee@example.com",
      name: "Platform Invitee",
      role: "viewer",
    })
    const accept = await ctx.request(`/api/platform/invitations/${String(token)}/accept`, {
      method: "POST",
      userId: invitee.id,
    })
    expect(accept.status).toBe(200)
    AcceptPlatformInvitationResponse.parse(await ctx.json(accept))
  })

  it("denies platform admin routes to non-admins and validates payloads", async () => {
    const ctx = createContractTestContext()

    const denied = await ctx.request("/api/platform/settings", {
      method: "PATCH",
      userId: ctx.viewer.id,
      body: JSON.stringify({ platformName: "Denied" }),
    })
    expect(denied.status).toBe(403)
    expectApiError(await ctx.json(denied))

    const deniedInvitations = await ctx.request("/api/platform/invitations", {
      userId: ctx.viewer.id,
    })
    expect(deniedInvitations.status).toBe(403)
    expectApiError(await ctx.json(deniedInvitations))

    const invalid = await ctx.request("/api/platform/settings", {
      method: "PATCH",
      body: JSON.stringify({ platformName: "" }),
    })
    expect(invalid.status).toBe(400)
    expectApiError(await ctx.json(invalid))

    const invalidLanguage = await ctx.request("/api/platform/settings", {
      method: "PATCH",
      body: JSON.stringify({ defaultLanguage: "es-ES" }),
    })
    expect(invalidLanguage.status).toBe(400)
    expectApiError(await ctx.json(invalidLanguage))

    const invalidInvitation = await ctx.request("/api/platform/invitations", {
      method: "POST",
      body: JSON.stringify({ email: "bad", role: "viewer" }),
    })
    expect(invalidInvitation.status).toBe(400)
    expectApiError(await ctx.json(invalidInvitation))

    const form = new FormData()
    form.set("file", new File(["not image"], "notes.txt", { type: "text/plain" }))
    const invalidUpload = await ctx.request("/api/platform/assets/favicon", {
      method: "POST",
      body: form,
    })
    expect(invalidUpload.status).toBe(415)
    expectApiError(await ctx.json(invalidUpload))
  })
})
