import { describe, expect, it } from "vitest"
import { ShareBrowseRequest } from "@bucketdrive/shared"

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
})
