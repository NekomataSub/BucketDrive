import { describe, expect, it } from "vitest"
import { ShareAccessResponse, ShareBrowseRequest } from "@bucketdrive/shared"

describe("public share contracts", () => {
  it("accepts browse password in JSON body instead of query params", () => {
    const parsed = ShareBrowseRequest.parse({
      folderId: "00000000-0000-4000-8000-000000000001",
      password: "test123",
    })

    expect(parsed).toEqual({
      folderId: "00000000-0000-4000-8000-000000000001",
      password: "test123",
    })
  })

  it("allows public file shares to expose a direct public object URL", () => {
    const parsed = ShareAccessResponse.parse({
      resourceType: "file",
      resourceName: "AGENTS.md",
      signedUrl: "https://r2.example.com/signed",
      publicUrl: "https://files.example.com/workspace/ws/files/file",
      brandingLogoUrl: null,
      brandingName: null,
    })

    expect(parsed.publicUrl).toContain("files.example.com")
  })
})
