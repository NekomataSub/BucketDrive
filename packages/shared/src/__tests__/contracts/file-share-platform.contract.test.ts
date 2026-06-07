import { describe, expect, it } from "vitest"
import {
  BatchUploadRequest,
  BatchUploadResponse,
  ListPlatformInvitationsResponse,
  ListMembersResponse,
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

  it("allows batch upload requests for empty folder trees", () => {
    const parsed = BatchUploadRequest.parse({
      items: [],
      emptyFolders: ["Album/Empty/Sub"],
    })

    expect(parsed.emptyFolders).toContain("Album/Empty/Sub")
  })

  it("rejects empty batch upload requests without files or folders", () => {
    expect(() => BatchUploadRequest.parse({ items: [], emptyFolders: [] })).toThrow()
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

  it("accepts Better Auth user ids in member responses", () => {
    const parsed = ListMembersResponse.parse({
      data: [
        {
          id: "00000000-0000-4000-8000-000000000005",
          userId: "k0RS7HQcHXhnJrjctHeUHSf8eXbxQ5p2",
          workspaceId: "00000000-0000-4000-8000-000000000006",
          role: "owner",
          email: "owner@example.com",
          name: "Owner",
          image: null,
          createdAt: "2026-05-20T00:00:00.000Z",
        },
      ],
      meta: {
        page: 1,
        limit: 1,
        total: 1,
        totalPages: 1,
      },
    })

    expect(parsed.data[0]?.userId).toBe("k0RS7HQcHXhnJrjctHeUHSf8eXbxQ5p2")
  })
})
