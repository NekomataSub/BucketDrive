import { describe, expect, it } from "vitest"
import {
  BatchUploadResponse,
  ListPlatformInvitationsResponse,
  ShareBrowseRequest,
} from "../../index"

describe("shared API contracts", () => {
  it("allows batch upload responses for root-level files", () => {
    const parsed = BatchUploadResponse.parse({
      folders: [],
      items: [
        {
          clientId: "local-1",
          fileId: "00000000-0000-4000-8000-000000000001",
          folderId: null,
          uploadId: "00000000-0000-4000-8000-000000000002",
          expiresAt: "2026-05-27T00:00:00.000Z",
          storageKey: "workspace/ws/files/file",
        },
      ],
    })

    expect(parsed.items[0]?.folderId).toBeNull()
  })

  it("accepts share browse credentials in the request body", () => {
    const parsed = ShareBrowseRequest.parse({
      folderId: "00000000-0000-4000-8000-000000000003",
      password: "test123",
    })

    expect(parsed.password).toBe("test123")
  })

  it("allows platform invitation list items to include a copyable invite link", () => {
    const parsed = ListPlatformInvitationsResponse.parse({
      data: [
        {
          id: "00000000-0000-4000-8000-000000000004",
          email: "user@example.com",
          role: "viewer",
          canCreateWorkspaces: false,
          status: "pending",
          expiresAt: "2026-05-27T00:00:00.000Z",
          createdAt: "2026-05-20T00:00:00.000Z",
          inviteLink: "https://drive.example.com/join?token=secret-token",
        },
      ],
    })

    expect(parsed.data[0]?.inviteLink).toContain("/join?token=")
  })
})
