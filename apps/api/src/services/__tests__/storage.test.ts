import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  buildPublicObjectUrl,
  createStorageProvider,
  R2StorageProvider,
  type StorageProvider,
  type StorageProviderError,
} from "../storage"

const mockSign = vi.hoisted(() =>
  vi.fn().mockImplementation((url: string) => {
    const signedUrl = new URL(url)
    signedUrl.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256")
    signedUrl.searchParams.set("X-Amz-Signature", "mock-signature")
    return Promise.resolve({ url: signedUrl.toString() })
  }),
)

vi.mock("aws4fetch", () => {
  return {
    AwsClient: vi.fn(function (this: Record<string, unknown>) {
      this.sign = mockSign
    } as unknown as new (...args: unknown[]) => { sign: typeof mockSign }),
  }
})

function createMockR2Bucket() {
  const store = new Map<string, ArrayBuffer>()

  return {
    store,
    put: vi.fn().mockImplementation(async (key: string, value: ArrayBuffer | ReadableStream | string) => {
      const buf = typeof value === "string"
        ? new TextEncoder().encode(value).buffer
        : value instanceof ReadableStream
          ? await new Response(value).arrayBuffer()
          : value

      store.set(key, buf)
      return { etag: `etag-${key}`, key, version: "1" }
    }),
    get: vi.fn().mockImplementation((key: string) => {
      const buf = store.get(key)
      if (!buf) return null
      return Promise.resolve({
        key,
        version: "1",
        size: buf.byteLength,
        etag: `etag-${key}`,
        httpEtag: `"etag-${key}"`,
        uploaded: new Date(),
        httpMetadata: {},
        customMetadata: {},
        range: () => ({ offset: 0, length: buf.byteLength }),
        writeHttpMetadata: () => {},
        body: new Uint8Array(buf),
        bodyUsed: false,
        arrayBuffer: () => Promise.resolve(buf),
        text: () => Promise.resolve(new TextDecoder().decode(buf)),
        json: () => Promise.resolve(JSON.parse(new TextDecoder().decode(buf)) as unknown),
        blob: () => Promise.resolve(new Blob([buf])),
      } as unknown as R2ObjectBody)
    }),
    delete: vi.fn().mockImplementation((_keys: string | string[]) => {
      const keys = Array.isArray(_keys) ? _keys : [_keys]
      for (const k of keys) store.delete(k)
      return Promise.resolve()
    }),
    head: vi.fn(),
    createMultipartUpload: vi.fn().mockImplementation((key: string) => {
      return Promise.resolve({ uploadId: `upload-${key}`, key })
    }),
    resumeMultipartUpload: vi.fn().mockImplementation((_key: string, uploadId: string) => {
      return {
        uploadId,
        uploadPart: vi.fn().mockImplementation((partNumber: number, _value: unknown) => {
          return Promise.resolve({ partNumber, etag: `etag-${String(partNumber)}` })
        }),
        complete: vi.fn().mockImplementation((parts: Array<{ partNumber: number; etag: string }>) => {
          return Promise.resolve({ etag: `completed-${String(parts.length)}`, key: _key, version: "1" })
        }),
        abort: vi.fn().mockResolvedValue(undefined),
      }
    }),
    list: vi.fn().mockResolvedValue({
      objects: [
        {
          key: "docs/report.pdf",
          size: 42,
          uploaded: new Date("2026-01-01T00:00:00.000Z"),
          httpMetadata: { contentType: "application/pdf" },
        },
      ],
      truncated: false,
      cursor: undefined,
    }),
  } as unknown as R2Bucket
}

describe("R2StorageProvider", () => {
  let provider: StorageProvider
  let mockBucket: ReturnType<typeof createMockR2Bucket>

  beforeEach(() => {
    mockSign.mockClear()
    mockBucket = createMockR2Bucket()
    provider = new R2StorageProvider({
      binding: mockBucket,
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      endpoint: "https://test.r2.cloudflarestorage.com",
      bucketName: "test-bucket",
    })
  })

  describe("generateSignedUploadUrl", () => {
    it("returns a signed URL for PUT", async () => {
      const url = await provider.generateSignedUploadUrl("workspace/ws1/files/test-file")
      expect(url).toContain("https://test.r2.cloudflarestorage.com/test-bucket/workspace/ws1/files/test-file")
      expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256")
      expect(url).toContain("X-Amz-Signature=mock-signature")
    })

    it("adds expiration to the URL", async () => {
      const url = await provider.generateSignedUploadUrl("key", 600)
      expect(url).toContain("X-Amz-Expires=600")
      expect(mockSign).toHaveBeenCalledWith(
        expect.stringContaining("X-Amz-Expires=600"),
        expect.objectContaining({ method: "PUT" }),
      )
    })

    it("defaults to 15 min expiration", async () => {
      const url = await provider.generateSignedUploadUrl("key")
      expect(url).toContain("X-Amz-Expires=900")
    })
  })

  describe("generateSignedDownloadUrl", () => {
    it("returns a signed URL for GET", async () => {
      const url = await provider.generateSignedDownloadUrl("workspace/ws1/files/test-file")
      expect(url).toContain("https://test.r2.cloudflarestorage.com/test-bucket/workspace/ws1/files/test-file")
      expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256")
      expect(url).toContain("X-Amz-Signature=mock-signature")
    })

    it("adds attachment disposition when a filename is provided", async () => {
      const url = await provider.generateSignedDownloadUrl("workspace/ws1/files/test-file", 900, {
        filename: "AGENTS.md",
      })

      expect(url).toContain("response-content-disposition=")
      expect(decodeURIComponent(url)).toContain('filename="AGENTS.md"')
    })
  })

  describe("list", () => {
    it("lists objects through the configured S3 endpoint", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          [
            "<ListBucketResult>",
            "<IsTruncated>false</IsTruncated>",
            "<Contents>",
            "<Key>docs/report.pdf</Key>",
            "<LastModified>2026-01-01T00:00:00.000Z</LastModified>",
            "<Size>42</Size>",
            "</Contents>",
            "</ListBucketResult>",
          ].join(""),
          { status: 200 },
        ),
      )

      const result = await provider.list({ prefix: "docs/" })

      expect(mockSign).toHaveBeenCalledWith(
        expect.stringContaining("https://test.r2.cloudflarestorage.com/test-bucket"),
        expect.objectContaining({ method: "GET" }),
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result.objects).toEqual([
        {
          key: "docs/report.pdf",
          size: 42,
          uploaded: new Date("2026-01-01T00:00:00.000Z"),
        },
      ])

      fetchMock.mockRestore()
    })

    it("throws a storage auth error when R2 rejects S3 credentials", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          [
            "<Error>",
            "<Code>SignatureDoesNotMatch</Code>",
            "<Message>The request signature we calculated does not match.</Message>",
            "</Error>",
          ].join(""),
          { status: 403 },
        ),
      )

      await expect(provider.list()).rejects.toMatchObject({
        code: "R2_AUTH_FAILED",
        message: "The request signature we calculated does not match.",
      } satisfies Partial<StorageProviderError>)

      fetchMock.mockRestore()
    })
  })

  describe("delete", () => {
    it("calls R2 delete on the binding", async () => {
      await provider.delete("some-key")
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockBucket.delete).toHaveBeenCalledWith("some-key")
    })

    it("does not throw on non-existent key", async () => {
      await expect(provider.delete("nonexistent-key")).resolves.not.toThrow()
    })
  })

  describe("copy", () => {
    it("copies an object from one key to another", async () => {
      await mockBucket.put("source-key", "test content")
      await provider.copy("source-key", "dest-key")
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockBucket.put).toHaveBeenCalledWith("dest-key", expect.anything())
    })

    it("throws when source does not exist", async () => {
      await expect(provider.copy("missing-key", "dest-key")).rejects.toThrow(
        "Source object not found: missing-key",
      )
    })
  })

  describe("createMultipartUpload", () => {
    it("returns an uploadId from R2", async () => {
      const result = await provider.createMultipartUpload("test-key")
      expect(result.uploadId).toBe("upload-test-key")
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockBucket.createMultipartUpload).toHaveBeenCalledWith("test-key")
    })
  })

  describe("generateSignedUploadPartUrl", () => {
    it("returns a signed URL with uploadId and partNumber", async () => {
      const url = await provider.generateSignedUploadPartUrl("upload-123", 3, "test-key")
      expect(url).toContain("https://test.r2.cloudflarestorage.com/test-bucket/test-key")
      expect(url).toContain("uploadId=upload-123")
      expect(url).toContain("partNumber=3")
      expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256")
      expect(url).toContain("X-Amz-Signature=mock-signature")
    })

    it("adds expiration to the URL", async () => {
      const url = await provider.generateSignedUploadPartUrl("upload-123", 1, "key", 600)
      expect(url).toContain("X-Amz-Expires=600")
    })
  })

  describe("completeMultipartUpload", () => {
    it("calls R2 resumeMultipartUpload and complete", async () => {
      await provider.completeMultipartUpload("upload-123", "test-key", [
        { partNumber: 1, etag: "etag-1" },
        { partNumber: 2, etag: "etag-2" },
      ])
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockBucket.resumeMultipartUpload).toHaveBeenCalledWith("test-key", "upload-123")
    })
  })

  describe("abortMultipartUpload", () => {
    it("calls R2 resumeMultipartUpload and abort", async () => {
      await provider.abortMultipartUpload("upload-123", "test-key")
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockBucket.resumeMultipartUpload).toHaveBeenCalledWith("test-key", "upload-123")
    })
  })
})

describe("buildPublicObjectUrl", () => {
  it("builds a public URL and trims trailing base slashes", () => {
    expect(buildPublicObjectUrl("https://files.example.com/", "workspace/ws/files/file")).toBe(
      "https://files.example.com/workspace/ws/files/file",
    )
  })

  it("encodes each storage key segment without encoding slashes", () => {
    expect(buildPublicObjectUrl("https://files.example.com", "workspace/ws/files/a b#c.md")).toBe(
      "https://files.example.com/workspace/ws/files/a%20b%23c.md",
    )
  })

  it("returns null when no public base URL is configured", () => {
    expect(buildPublicObjectUrl(null, "workspace/ws/files/file")).toBeNull()
  })
})

describe("createStorageProvider", () => {
  it("uses R2_BUCKET_NAME for signed URL providers", async () => {
    const provider = createStorageProvider({
      STORAGE: createMockR2Bucket(),
      R2_ACCESS_KEY_ID: "test-key",
      R2_SECRET_ACCESS_KEY: "test-secret",
      R2_ENDPOINT: "https://test.r2.cloudflarestorage.com",
      R2_BUCKET_NAME: "custom-bucket",
    })

    const url = await provider.generateSignedUploadUrl("key")

    expect(url).toContain("https://test.r2.cloudflarestorage.com/custom-bucket/key")
  })
})
