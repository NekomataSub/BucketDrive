import { describe, expect, it } from "vitest"
import {
  DashboardAuditResponse,
  DashboardOverviewResponse,
  DashboardSettingsResponse,
} from "@bucketdrive/shared"
import { createContractTestContext, expectApiError } from "./test-harness"

describe("dashboard contracts", () => {
  it("returns overview, audit, and settings responses", async () => {
    const ctx = createContractTestContext()
    const folder = ctx.seedFolder({ name: "Reports", path: "/Reports" })
    ctx.seedFile({ folderId: folder.id, originalName: "Large.bin", sizeBytes: 100 })

    const overview = await ctx.request(`/api/workspaces/${ctx.workspaceId}/dashboard/overview`)
    expect(overview.status).toBe(200)
    const overviewBody = DashboardOverviewResponse.parse(await ctx.json(overview))
    expect(overviewBody.largestFiles[0]?.folderId).toBe(folder.id)

    const audit = await ctx.request(`/api/workspaces/${ctx.workspaceId}/dashboard/audit`)
    expect(audit.status).toBe(200)
    DashboardAuditResponse.parse(await ctx.json(audit))

    const settings = await ctx.request(`/api/workspaces/${ctx.workspaceId}/dashboard/settings`)
    expect(settings.status).toBe(200)
    DashboardSettingsResponse.parse(await ctx.json(settings))
  })

  it("enforces settings RBAC and validation", async () => {
    const ctx = createContractTestContext()

    const denied = await ctx.request(`/api/workspaces/${ctx.workspaceId}/dashboard/settings`, {
      method: "PATCH",
      userId: ctx.viewer.id,
      body: JSON.stringify({ brandingName: "Viewer" }),
    })
    expect(denied.status).toBe(403)
    expectApiError(await ctx.json(denied))

    const invalid = await ctx.request(`/api/workspaces/${ctx.workspaceId}/dashboard/settings`, {
      method: "PATCH",
      body: JSON.stringify({ maxFileSizeBytes: -1 }),
    })
    expect(invalid.status).toBe(400)
    expectApiError(await ctx.json(invalid))
  })

  it("uploads bucket branding logo through settings permissions", async () => {
    const ctx = createContractTestContext()
    const form = new FormData()
    form.set("file", new File([new Uint8Array([1, 2, 3])], "brand.webp", { type: "image/webp" }))

    const denied = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/dashboard/settings/assets/logo`,
      {
        method: "POST",
        userId: ctx.viewer.id,
        body: form,
      },
    )
    expect(denied.status).toBe(403)
    expectApiError(await ctx.json(denied))

    const allowedForm = new FormData()
    allowedForm.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "brand.webp", { type: "image/webp" }),
    )
    const uploaded = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/dashboard/settings/assets/logo`,
      {
        method: "POST",
        body: allowedForm,
      },
    )
    expect(uploaded.status).toBe(200)
    const settings = DashboardSettingsResponse.parse(await ctx.json(uploaded))
    expect(settings.brandingLogoAssetUrl).toMatch(/^\/api\/shares\/assets\/branding-logo/)

    const asset = await ctx.request("/api/shares/assets/branding-logo", { userId: null })
    expect(asset.status).toBe(200)
    expect(asset.headers.get("content-type")).toContain("image/webp")
  })
})
