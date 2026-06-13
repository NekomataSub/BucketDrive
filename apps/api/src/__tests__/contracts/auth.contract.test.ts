import { describe, expect, it } from "vitest"
import { PlatformSettingsResponse } from "@bucketdrive/shared"
import { createContractTestContext, expectApiError } from "./test-harness"

describe("auth contracts", () => {
  it("returns 401 for protected routes without a session", async () => {
    const ctx = createContractTestContext()

    const response = await ctx.request(`/api/workspaces/${ctx.workspaceId}/files`, { userId: null })
    const body = await ctx.json(response)

    expect(response.status).toBe(401)
    expectApiError(body)
  })

  it("returns platform settings from a public route", async () => {
    const ctx = createContractTestContext()

    const response = await ctx.request("/api/platform/settings", { userId: null })
    const body = await ctx.json(response)

    expect(response.status).toBe(200)
    expect(() => PlatformSettingsResponse.parse(body)).not.toThrow()
  })

  it("redirects frontend routes to the configured app URL", async () => {
    const ctx = createContractTestContext()

    const root = await ctx.request("/", { userId: null })
    const login = await ctx.request("/login?redirect=%2Fdashboard%2Ffiles", { userId: null })

    expect(root.status).toBe(302)
    expect(root.headers.get("location")).toBe("http://localhost:5173/")
    expect(login.status).toBe(302)
    expect(login.headers.get("location")).toBe(
      "http://localhost:5173/login?redirect=%2Fdashboard%2Ffiles",
    )
  })

  it("keeps unknown API routes as JSON 404 responses", async () => {
    const ctx = createContractTestContext()

    const response = await ctx.request("/api/unknown", { userId: null })
    const body = await ctx.json(response)

    expect(response.status).toBe(404)
    expectApiError(body)
  })
})
