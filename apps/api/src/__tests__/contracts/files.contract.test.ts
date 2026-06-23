import { describe, expect, it } from "vitest"
import {
  BatchUploadResponse,
  DeleteFileResponse,
  DownloadUrlResponse,
  FileObjectSchema,
  GetUploadSessionResponse,
  InitiateUploadResponse,
  ListFilesResponse,
  PreviewUrlResponse,
  ThumbnailUrlResponse,
  ToggleFavoriteResponse,
  UpdateFileTagsResponse,
} from "@bucketdrive/shared"
import { createContractTestContext, expectApiError } from "./test-harness"

describe("files contracts", () => {
  it("lists, uploads, reads, updates, favorites, tags, and deletes files", async () => {
    const ctx = createContractTestContext()
    const existing = ctx.seedFile({ originalName: "Alpha.txt" })
    const tag = ctx.seedTag()

    const list = await ctx.request(`/api/workspaces/${ctx.workspaceId}/files?limit=10`)
    expect(list.status).toBe(200)
    ListFilesResponse.parse(await ctx.json(list))

    const initiate = await ctx.request(`/api/workspaces/${ctx.workspaceId}/files/upload`, {
      method: "POST",
      body: JSON.stringify({ fileName: "Upload.txt", mimeType: "text/plain", sizeBytes: 12 }),
    })
    expect(initiate.status).toBe(201)
    const initiated = InitiateUploadResponse.parse(await ctx.json(initiate))

    const session = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/files/uploads/${initiated.uploadId}`,
    )
    expect(session.status).toBe(200)
    GetUploadSessionResponse.parse(await ctx.json(session))

    const complete = await ctx.request(`/api/workspaces/${ctx.workspaceId}/files/upload/complete`, {
      method: "POST",
      body: JSON.stringify({
        uploadId: initiated.uploadId,
        fileName: "Upload.txt",
        mimeType: "text/plain",
      }),
    })
    expect(complete.status).toBe(201)
    FileObjectSchema.parse(await ctx.json(complete))

    const getFile = await ctx.request(`/api/workspaces/${ctx.workspaceId}/files/${existing.id}`)
    expect(getFile.status).toBe(200)
    FileObjectSchema.parse(await ctx.json(getFile))

    const preview = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/files/${existing.id}/preview`,
    )
    expect(preview.status).toBe(200)
    PreviewUrlResponse.parse(await ctx.json(preview))

    const download = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/files/${existing.id}/download`,
    )
    expect(download.status).toBe(200)
    DownloadUrlResponse.parse(await ctx.json(download))

    await ctx.env.STORAGE.put(existing.storageKey, "alpha content", {
      httpMetadata: { contentType: "text/plain" },
    })
    const content = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/files/${existing.id}/content`,
    )
    expect(content.status).toBe(200)
    expect(content.headers.get("Content-Type")).toContain("text/plain")
    expect(await content.text()).toBe("alpha content")

    const renamed = await ctx.request(`/api/workspaces/${ctx.workspaceId}/files/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed.txt" }),
    })
    expect(renamed.status).toBe(200)
    FileObjectSchema.parse(await ctx.json(renamed))

    const favorite = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/files/${existing.id}/favorite`,
      {
        method: "POST",
      },
    )
    expect(favorite.status).toBe(200)
    ToggleFavoriteResponse.parse(await ctx.json(favorite))

    const tags = await ctx.request(`/api/workspaces/${ctx.workspaceId}/files/${existing.id}/tags`, {
      method: "POST",
      body: JSON.stringify({ tagIds: [tag.id] }),
    })
    expect(tags.status).toBe(200)
    UpdateFileTagsResponse.parse(await ctx.json(tags))

    const thumbnailFileId = "00000000-0000-4000-8000-999999999001"
    const thumbnailKey = `bucket/thumbnails/${thumbnailFileId}.webp`
    await ctx.env.STORAGE.put(thumbnailKey, new Uint8Array([1, 2, 3]), {
      httpMetadata: { contentType: "image/webp" },
    })
    const thumbnailFile = ctx.seedFile({
      id: thumbnailFileId,
      originalName: "Image.png",
      mimeType: "image/png",
      extension: "png",
      thumbnailKey,
    })
    const thumbnail = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/files/${thumbnailFile.id}/thumbnail`,
    )
    expect(thumbnail.status).toBe(200)
    ThumbnailUrlResponse.parse(await ctx.json(thumbnail))

    const invalidThumbnailFile = ctx.seedFile({
      originalName: "Corrupt.png",
      mimeType: "image/png",
      extension: "png",
      thumbnailKey: "bucket/platform/logo.webp",
    })
    await ctx.env.STORAGE.put("bucket/platform/logo.webp", new Uint8Array([1, 2, 3]), {
      httpMetadata: { contentType: "image/webp" },
    })
    const invalidThumbnail = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/files/${invalidThumbnailFile.id}/thumbnail`,
    )
    expect(invalidThumbnail.status).toBe(404)
    expectApiError(await ctx.json(invalidThumbnail))
    const invalidThumbnailRow = ctx.sqlite
      .prepare("select thumbnail_key from file_object where id = ?")
      .get(invalidThumbnailFile.id) as { thumbnail_key: string | null }
    expect(invalidThumbnailRow.thumbnail_key).not.toBe("bucket/platform/logo.webp")
    expect(
      invalidThumbnailRow.thumbnail_key === null ||
        invalidThumbnailRow.thumbnail_key === `bucket/thumbnails/${invalidThumbnailFile.id}.webp`,
    ).toBe(true)

    const deleted = await ctx.request(`/api/workspaces/${ctx.workspaceId}/files/${existing.id}`, {
      method: "DELETE",
    })
    expect(deleted.status).toBe(200)
    DeleteFileResponse.parse(await ctx.json(deleted))
  })

  it("enforces RBAC and validates upload payloads", async () => {
    const ctx = createContractTestContext()
    const file = ctx.seedFile()

    const denied = await ctx.request(`/api/workspaces/${ctx.workspaceId}/files/${file.id}`, {
      method: "DELETE",
      userId: ctx.viewer.id,
    })
    expect(denied.status).toBe(403)
    expectApiError(await ctx.json(denied))

    const invalid = await ctx.request(`/api/workspaces/${ctx.workspaceId}/files/upload`, {
      method: "POST",
      body: JSON.stringify({ fileName: "", mimeType: "text/plain", sizeBytes: -1 }),
    })
    expect(invalid.status).toBe(400)
    expectApiError(await ctx.json(invalid))
  })

  it("prepares batch uploads with nested folders and empty folder trees", async () => {
    const ctx = createContractTestContext()

    const response = await ctx.request(`/api/workspaces/${ctx.workspaceId}/files/batch-upload`, {
      method: "POST",
      body: JSON.stringify({
        items: [
          {
            clientId: "local-1",
            relativePath: "Album/Sub/photo.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 12,
          },
        ],
        emptyFolders: ["Album/Empty/Sub"],
      }),
    })

    expect(response.status).toBe(201)
    const parsed = BatchUploadResponse.parse(await ctx.json(response))
    const item = parsed.items[0]

    expect(item?.folderId).toBeTruthy()
    expect(parsed.folders.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(["/Album", "/Album/Sub", "/Album/Empty", "/Album/Empty/Sub"]),
    )
  })
})
