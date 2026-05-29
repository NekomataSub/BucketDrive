interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  run<T = unknown>(): Promise<T>
  all<T = unknown>(): Promise<T>
  raw<T = unknown>(): Promise<T[]>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
}

interface R2ObjectBody {
  body: ReadableStream<Uint8Array> | null
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
  json(): Promise<unknown>
  blob(): Promise<Blob>
}

interface R2MultipartUpload {
  readonly key: string
  readonly uploadId: string
  uploadPart(partNumber: number, value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | string | Blob): Promise<{ partNumber: number; etag: string }>
  abort(): Promise<void>
  complete(uploadedParts: Array<{ partNumber: number; etag: string }>): Promise<unknown>
}

interface R2Object {
  key: string
  size: number
  uploaded: Date
  httpMetadata?: {
    contentType?: string
  }
}

type R2Objects =
  | {
      objects: R2Object[]
      delimitedPrefixes: string[]
      truncated: false
    }
  | {
      objects: R2Object[]
      delimitedPrefixes: string[]
      truncated: true
      cursor: string
    }

interface R2Bucket {
  delete(key: string): Promise<void>
  get(key: string): Promise<R2ObjectBody | null>
  put(key: string, value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | string | null): Promise<unknown>
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<R2Objects>
  createMultipartUpload(key: string): Promise<R2MultipartUpload>
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload
}

interface ScheduledEvent {
  scheduledTime: number
  cron: string
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}
