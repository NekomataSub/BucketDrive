import { AwsClient } from "aws4fetch"

export class StorageProviderError extends Error {
  constructor(
    public code: "R2_AUTH_FAILED" | "R2_BUCKET_NOT_FOUND" | "R2_LIST_FAILED",
    message: string,
  ) {
    super(message)
    this.name = "StorageProviderError"
  }
}

export interface StorageProvider {
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    objects: Array<{ key: string; size: number; uploaded?: Date; httpMetadata?: { contentType?: string } }>
    cursor?: string
    truncated: boolean
  }>
  generateSignedUploadUrl(key: string, expiresIn?: number): Promise<string>
  generateSignedDownloadUrl(
    key: string,
    expiresIn?: number,
    options?: { filename?: string },
  ): Promise<string>
  delete(key: string): Promise<void>
  copy(fromKey: string, toKey: string): Promise<void>
  createMultipartUpload(key: string): Promise<{ uploadId: string }>
  generateSignedUploadPartUrl(
    uploadId: string,
    partNumber: number,
    key: string,
    expiresIn?: number,
  ): Promise<string>
  completeMultipartUpload(
    uploadId: string,
    key: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ): Promise<void>
  abortMultipartUpload(uploadId: string, key: string): Promise<void>
}

export class R2StorageProvider implements StorageProvider {
  private binding: R2Bucket
  private s3: AwsClient
  private bucketName: string
  private endpoint: string

  constructor(config: {
    binding: R2Bucket
    accessKeyId: string
    secretAccessKey: string
    endpoint: string
    bucketName?: string
  }) {
    this.binding = config.binding
    this.bucketName = config.bucketName ?? "bucketdrive-files"
    this.endpoint = config.endpoint.replace(/\/$/, "")
    this.s3 = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto",
    })
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    objects: Array<{ key: string; size: number; uploaded?: Date; httpMetadata?: { contentType?: string } }>
    cursor?: string
    truncated: boolean
  }> {
    const url = new URL(`${this.endpoint}/${this.bucketName}`)
    url.searchParams.set("list-type", "2")
    url.searchParams.set("max-keys", String(options?.limit ?? 1000))
    if (options?.prefix) url.searchParams.set("prefix", options.prefix)
    if (options?.cursor) url.searchParams.set("continuation-token", options.cursor)

    const signed = await this.s3.sign(url.toString(), {
      method: "GET",
    })
    const response = await fetch(signed)

    if (!response.ok) {
      const text = await response.text()
      const r2Code = readXmlValue(text, "Code")
      const r2Message = readXmlValue(text, "Message")
      if (response.status === 403 || r2Code === "SignatureDoesNotMatch" || r2Code === "InvalidAccessKeyId") {
        throw new StorageProviderError(
          "R2_AUTH_FAILED",
          r2Message ?? "R2 rejected the configured S3 credentials.",
        )
      }
      if (response.status === 404 || r2Code === "NoSuchBucket") {
        throw new StorageProviderError(
          "R2_BUCKET_NOT_FOUND",
          r2Message ?? "The configured R2 bucket was not found.",
        )
      }
      throw new StorageProviderError(
        "R2_LIST_FAILED",
        r2Message ?? `R2 list failed: ${String(response.status)} ${response.statusText}`,
      )
    }

    return parseListBucketResult(await response.text())
  }

  async generateSignedUploadUrl(key: string, expiresIn = 900): Promise<string> {
    const url = new URL(`${this.endpoint}/${this.bucketName}/${key}`)
    url.searchParams.set("X-Amz-Expires", String(expiresIn))
    const signed = await this.s3.sign(url.toString(), {
      method: "PUT",
      aws: { signQuery: true },
    })
    return signed.url
  }

  async generateSignedDownloadUrl(
    key: string,
    expiresIn = 900,
    options?: { filename?: string },
  ): Promise<string> {
    const url = new URL(`${this.endpoint}/${this.bucketName}/${key}`)
    url.searchParams.set("X-Amz-Expires", String(expiresIn))
    if (options?.filename) {
      url.searchParams.set("response-content-disposition", buildAttachmentDisposition(options.filename))
    }
    const signed = await this.s3.sign(url.toString(), {
      method: "GET",
      aws: { signQuery: true },
    })
    return signed.url
  }

  async delete(key: string): Promise<void> {
    await this.binding.delete(key)
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const object = await this.binding.get(fromKey)
    if (!object) {
      throw new Error(`Source object not found: ${fromKey}`)
    }
    await this.binding.put(toKey, object.body)
  }

  async createMultipartUpload(key: string): Promise<{ uploadId: string }> {
    const multipart = await this.binding.createMultipartUpload(key)
    return { uploadId: multipart.uploadId }
  }

  async generateSignedUploadPartUrl(
    uploadId: string,
    partNumber: number,
    key: string,
    expiresIn = 900,
  ): Promise<string> {
    const url = new URL(`${this.endpoint}/${this.bucketName}/${key}`)
    url.searchParams.set("uploadId", uploadId)
    url.searchParams.set("partNumber", String(partNumber))
    url.searchParams.set("X-Amz-Expires", String(expiresIn))

    const signed = await this.s3.sign(url.toString(), {
      method: "PUT",
      aws: { signQuery: true },
    })
    return signed.url
  }

  async completeMultipartUpload(
    uploadId: string,
    key: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ): Promise<void> {
    const multipart = this.binding.resumeMultipartUpload(key, uploadId)
    await multipart.complete(
      parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
    )
  }

  async abortMultipartUpload(uploadId: string, key: string): Promise<void> {
    const multipart = this.binding.resumeMultipartUpload(key, uploadId)
    await multipart.abort()
  }
}

function parseListBucketResult(xml: string): {
  objects: Array<{ key: string; size: number; uploaded?: Date }>
  cursor?: string
  truncated: boolean
} {
  const truncated = readXmlValue(xml, "IsTruncated") === "true"
  const cursor = readXmlValue(xml, "NextContinuationToken")
  const objects = Array.from(xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)).flatMap(
    (match) => {
      const content = match[1]
      if (!content) return []

      const key = readXmlValue(content, "Key")
      const sizeText = readXmlValue(content, "Size")
      if (!key || !sizeText) return []

      const lastModified = readXmlValue(content, "LastModified")
      return [{
        key,
        size: Number(sizeText),
        uploaded: lastModified ? new Date(lastModified) : undefined,
      }]
    },
  )

  return { objects, cursor, truncated }
}

function readXmlValue(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(xml)
  return match?.[1] ? decodeXml(match[1]) : undefined
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
}

export function createStorageProvider(env: {
  STORAGE: R2Bucket
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  R2_BUCKET_NAME?: string
}): StorageProvider {
  if (env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT) {
    return new R2StorageProvider({
      binding: env.STORAGE,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      endpoint: env.R2_ENDPOINT,
      bucketName: env.R2_BUCKET_NAME,
    })
  }

  return new R2BindingProvider(env.STORAGE)
}

class R2BindingProvider implements StorageProvider {
  constructor(private binding: R2Bucket) {}

  async list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    objects: Array<{ key: string; size: number; uploaded?: Date; httpMetadata?: { contentType?: string } }>
    cursor?: string
    truncated: boolean
  }> {
    const result = await this.binding.list({
      prefix: options?.prefix,
      cursor: options?.cursor,
      limit: options?.limit,
    })

    return {
      objects: result.objects.map((object) => ({
        key: object.key,
        size: object.size,
        uploaded: object.uploaded,
        httpMetadata: object.httpMetadata,
      })),
      cursor: result.truncated ? result.cursor : undefined,
      truncated: result.truncated,
    }
  }

  generateSignedUploadUrl(_key: string, _expiresIn?: number): Promise<string> {
    return Promise.reject(
      new Error(
        "Presigned URLs require R2 S3 credentials. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT in .dev.vars.",
      ),
    )
  }

  generateSignedDownloadUrl(
    _key: string,
    _expiresIn?: number,
    _options?: { filename?: string },
  ): Promise<string> {
    return Promise.reject(
      new Error(
        "Presigned URLs require R2 S3 credentials. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT in .dev.vars.",
      ),
    )
  }

  async delete(key: string): Promise<void> {
    await this.binding.delete(key)
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const object = await this.binding.get(fromKey)
    if (!object) {
      throw new Error(`Source object not found: ${fromKey}`)
    }
    await this.binding.put(toKey, object.body)
  }

  async createMultipartUpload(key: string): Promise<{ uploadId: string }> {
    const multipart = await this.binding.createMultipartUpload(key)
    return { uploadId: multipart.uploadId }
  }

  generateSignedUploadPartUrl(): Promise<string> {
    return Promise.reject(
      new Error(
        "Presigned part URLs require R2 S3 credentials. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT in .dev.vars.",
      ),
    )
  }

  async completeMultipartUpload(
    uploadId: string,
    key: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ): Promise<void> {
    const multipart = this.binding.resumeMultipartUpload(key, uploadId)
    await multipart.complete(
      parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
    )
  }

  async abortMultipartUpload(uploadId: string, key: string): Promise<void> {
    const multipart = this.binding.resumeMultipartUpload(key, uploadId)
    await multipart.abort()
  }
}

export function buildPublicObjectUrl(baseUrl: string | null | undefined, key: string): string | null {
  const normalizedBase = baseUrl?.trim().replace(/\/+$/, "")
  if (!normalizedBase) return null

  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  return `${normalizedBase}/${encodedKey}`
}

function buildAttachmentDisposition(filename: string): string {
  const asciiName = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_")
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
