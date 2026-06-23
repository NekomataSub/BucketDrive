import { describe, expect, it, vi, beforeEach } from "vitest"
import { ThumbnailService } from "../thumbnail.service"
import type { StorageProvider } from "../storage"

const mockGetDB = vi.hoisted(() => vi.fn())

vi.mock("../../lib/db", () => ({
  getDB: mockGetDB,
}))

vi.mock("@cf-wasm/photon/workerd", () => {
  class MockPhotonImage {
    static new_from_byteslice = vi.fn(() => new MockPhotonImage())

    get_width() {
      return 512
    }

    get_height() {
      return 256
    }

    get_bytes_webp() {
      return new Uint8Array([1, 2, 3])
    }

    free() {}
  }

  return {
    PhotonImage: MockPhotonImage,
    resize: vi.fn(() => new MockPhotonImage()),
    SamplingFilter: { Lanczos3: 1 },
  }
})

function createMockDB(
  params: {
    pendingFiles?: Array<{ id: string; workspaceId: string; storageKey: string; mimeType: string }>
  } = {},
) {
  const run = vi.fn().mockResolvedValue(undefined)
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({ run })),
    })),
  }))
  const all = vi.fn().mockResolvedValue(params.pendingFiles ?? [])
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({ all })),
      })),
    })),
  }))

  return { db: { update, select }, run, all, update, select }
}

function createMockStorage() {
  const getObject = vi.fn<StorageProvider["getObject"]>().mockResolvedValue({
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]))
        controller.close()
      },
    }),
    size: 4,
    contentType: "image/png",
  })
  const upload = vi.fn<StorageProvider["upload"]>().mockResolvedValue(undefined)

  return {
    storage: { getObject, upload } as unknown as StorageProvider,
    getObject,
    upload,
  }
}

describe("ThumbnailService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("generates a webp thumbnail for images and updates the file row", async () => {
    const { db, run } = createMockDB()
    mockGetDB.mockReturnValue(db)
    const { storage, upload } = createMockStorage()
    const service = new ThumbnailService({ storage })

    const generated = await service.generate({
      fileId: "file-1",
      storageKey: "bucket/files/upload/image.png",
      mimeType: "image/png",
    })

    expect(generated).toBe(true)
    expect(upload).toHaveBeenCalledOnce()
    const [uploadInput] = upload.mock.calls[0] ?? []
    expect(uploadInput).toMatchObject({
      key: "bucket/thumbnails/file-1.webp",
      contentType: "image/webp",
    })
    expect(uploadInput?.body).toBeInstanceOf(Uint8Array)
    expect(run).toHaveBeenCalled()
  })

  it("does not generate thumbnails for non-image mime types", async () => {
    const { db } = createMockDB()
    mockGetDB.mockReturnValue(db)
    const { storage, getObject, upload } = createMockStorage()
    const service = new ThumbnailService({ storage })

    const generated = await service.generate({
      fileId: "file-1",
      storageKey: "bucket/files/upload/file.pdf",
      mimeType: "application/pdf",
    })

    expect(generated).toBe(false)
    expect(getObject).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it("refuses to generate thumbnails from non-file storage prefixes", async () => {
    const { db } = createMockDB()
    mockGetDB.mockReturnValue(db)
    const { storage, getObject, upload } = createMockStorage()
    const service = new ThumbnailService({ storage })

    const generated = await service.generate({
      fileId: "file-1",
      storageKey: "bucket/platform/logo.webp",
      mimeType: "image/webp",
    })

    expect(generated).toBe(false)
    expect(getObject).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it("processes pending image thumbnails and skips videos in backfill", async () => {
    const { db } = createMockDB({
      pendingFiles: [
        {
          id: "image-1",
          workspaceId: "workspace-1",
          storageKey: "workspace/workspace-1/files/upload/image.png",
          mimeType: "image/png",
        },
        {
          id: "video-1",
          workspaceId: "workspace-1",
          storageKey: "workspace/workspace-1/files/upload/video.mp4",
          mimeType: "video/mp4",
        },
      ],
    })
    mockGetDB.mockReturnValue(db)
    const { storage } = createMockStorage()
    const service = new ThumbnailService({ storage })
    const generate = vi.spyOn(service, "generate").mockResolvedValue(true)

    const result = await service.processPending({ limit: 10 })

    expect(result).toEqual({
      scanned: 2,
      generated: 1,
      skipped: 1,
      failed: 0,
    })
    expect(generate).toHaveBeenCalledOnce()
  })
})
