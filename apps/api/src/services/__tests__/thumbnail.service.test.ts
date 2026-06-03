import { describe, expect, it, vi, beforeEach } from "vitest"
import { ThumbnailService } from "../thumbnail.service"

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

function createMockDB(params: {
  pendingFiles?: Array<{ id: string; workspaceId: string; storageKey: string; mimeType: string }>
} = {}) {
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
  const get = vi.fn().mockResolvedValue({
    arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer),
  })
  const put = vi.fn().mockResolvedValue({})

  return {
    storage: { get, put } as unknown as R2Bucket,
    get,
    put,
  }
}

describe("ThumbnailService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("generates a webp thumbnail for images and updates the file row", async () => {
    const { db, run } = createMockDB()
    mockGetDB.mockReturnValue(db)
    const { storage, put } = createMockStorage()
    const service = new ThumbnailService({ storage })

    const generated = await service.generate({
      fileId: "file-1",
      workspaceId: "workspace-1",
      storageKey: "workspace/workspace-1/files/upload/image.png",
      mimeType: "image/png",
    })

    expect(generated).toBe(true)
    expect(put).toHaveBeenCalledWith(
      "workspace/workspace-1/thumbnails/file-1.webp",
      expect.any(Uint8Array),
      { httpMetadata: { contentType: "image/webp" } },
    )
    expect(run).toHaveBeenCalled()
  })

  it("does not generate thumbnails for non-image mime types", async () => {
    const { db } = createMockDB()
    mockGetDB.mockReturnValue(db)
    const { storage, get, put } = createMockStorage()
    const service = new ThumbnailService({ storage })

    const generated = await service.generate({
      fileId: "file-1",
      workspaceId: "workspace-1",
      storageKey: "workspace/workspace-1/files/upload/file.pdf",
      mimeType: "application/pdf",
    })

    expect(generated).toBe(false)
    expect(get).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
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
