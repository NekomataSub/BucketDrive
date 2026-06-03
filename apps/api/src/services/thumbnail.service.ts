import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon/workerd"
import { and, eq, isNull, like, or } from "drizzle-orm"
import { fileObject } from "@bucketdrive/shared"
import { getDB } from "../lib/db"

export interface ThumbnailServiceDeps {
  storage: R2Bucket
}

type ThumbnailPut = (
  key: string,
  value: Uint8Array,
  options: { httpMetadata: { contentType: string } },
) => Promise<unknown>

export interface ThumbnailBackfillResult {
  scanned: number
  generated: number
  skipped: number
  failed: number
}

export class ThumbnailService {
  private readonly MAX_DIMENSION = 256
  private readonly MAX_SOURCE_BYTES = 20 * 1024 * 1024 // 20 MB

  constructor(private deps: ThumbnailServiceDeps) {}

  async generate(params: {
    fileId: string
    workspaceId: string
    storageKey: string
    mimeType: string
  }): Promise<boolean> {
    if (!this.isImage(params.mimeType)) {
      return false
    }

    try {
      const object = await this.deps.storage.get(params.storageKey)
      if (!object) {
        console.warn(`Thumbnail: source object not found for key ${params.storageKey}`)
        return false
      }

      const sourceBytes = new Uint8Array(await object.arrayBuffer())
      if (sourceBytes.byteLength > this.MAX_SOURCE_BYTES) {
        console.warn(`Thumbnail: skipping image > ${String(this.MAX_SOURCE_BYTES)} bytes`)
        return false
      }

      const inputImage = PhotonImage.new_from_byteslice(sourceBytes)
      const width = inputImage.get_width()
      const height = inputImage.get_height()

      let targetWidth = width
      let targetHeight = height

      if (width > this.MAX_DIMENSION || height > this.MAX_DIMENSION) {
        const ratio = Math.min(
          this.MAX_DIMENSION / width,
          this.MAX_DIMENSION / height,
        )
        targetWidth = Math.round(width * ratio)
        targetHeight = Math.round(height * ratio)
      }

      const outputImage = resize(
        inputImage,
        targetWidth,
        targetHeight,
        SamplingFilter.Lanczos3,
      )

      const thumbnailBytes = outputImage.get_bytes_webp()

      inputImage.free()
      outputImage.free()

      const thumbnailKey = `workspace/${params.workspaceId}/thumbnails/${params.fileId}.webp`

      await this.putThumbnail(thumbnailKey, thumbnailBytes)

      const db = getDB()
      await db
        .update(fileObject)
        .set({
          thumbnailKey,
          metadata: JSON.stringify({
            width,
            height,
            thumbnailWidth: targetWidth,
            thumbnailHeight: targetHeight,
          }),
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(fileObject.id, params.fileId),
            eq(fileObject.workspaceId, params.workspaceId),
          ),
        )
        .run()

      console.warn(`Thumbnail generated for ${params.fileId}: ${thumbnailKey}`)
      return true
    } catch (err) {
      console.warn(`Thumbnail generation failed for ${params.fileId}:`, err)
      // Thumbnail failures are non-critical; do not throw
      return false
    }
  }

  async uploadVideoFrame(params: {
    fileId: string
    workspaceId: string
    blob: Blob
  }): Promise<void> {
    try {
      const bytes = new Uint8Array(await params.blob.arrayBuffer())
      const thumbnailKey = `workspace/${params.workspaceId}/thumbnails/${params.fileId}.webp`

      await this.putThumbnail(thumbnailKey, bytes)

      const db = getDB()
      await db
        .update(fileObject)
        .set({
          thumbnailKey,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(fileObject.id, params.fileId),
            eq(fileObject.workspaceId, params.workspaceId),
          ),
        )
        .run()
    } catch (err) {
      console.warn(`Video thumbnail upload failed for ${params.fileId}:`, err)
    }
  }

  private async putThumbnail(key: string, bytes: Uint8Array): Promise<void> {
    const put = this.deps.storage.put.bind(this.deps.storage) as unknown as ThumbnailPut
    await put(key, bytes, {
      httpMetadata: { contentType: "image/webp" },
    })
  }

  async processPending(params: {
    workspaceId?: string
    limit?: number
  } = {}): Promise<ThumbnailBackfillResult> {
    const limit = Math.max(1, Math.min(params.limit ?? 25, 100))
    const db = getDB()
    const conditions = [
      eq(fileObject.isDeleted, false),
      isNull(fileObject.thumbnailKey),
      or(
        like(fileObject.mimeType, "image/%"),
        like(fileObject.mimeType, "video/%"),
      ),
    ]

    if (params.workspaceId) {
      conditions.push(eq(fileObject.workspaceId, params.workspaceId))
    }

    const pendingFiles = await db
      .select({
        id: fileObject.id,
        workspaceId: fileObject.workspaceId,
        storageKey: fileObject.storageKey,
        mimeType: fileObject.mimeType,
      })
      .from(fileObject)
      .where(and(...conditions))
      .limit(limit)
      .all()

    const result: ThumbnailBackfillResult = {
      scanned: pendingFiles.length,
      generated: 0,
      skipped: 0,
      failed: 0,
    }

    for (const file of pendingFiles) {
      if (!this.isImage(file.mimeType)) {
        result.skipped += 1
        continue
      }

      const generated = await this.generate({
        fileId: file.id,
        workspaceId: file.workspaceId,
        storageKey: file.storageKey,
        mimeType: file.mimeType,
      })
      if (generated) {
        result.generated += 1
      } else {
        result.failed += 1
      }
    }

    return result
  }

  private isImage(mimeType: string): boolean {
    return mimeType.startsWith("image/")
  }
}
