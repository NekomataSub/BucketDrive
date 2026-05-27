import { eq, and, inArray } from "drizzle-orm"
import { getDB } from "../lib/db"
import {
  fileObject,
  folder,
  uploadSession,
  uploadPart,
  bucket,
  auditLog,
  workspace,
  workspaceSettings,
} from "@bucketdrive/shared/db/schema"
import type { StorageProvider } from "./storage"

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024
const MULTIPART_THRESHOLD = 250 * 1024 * 1024
const MIN_PART_SIZE = 5 * 1024 * 1024
const BLOCKED_EXTENSIONS = [".exe", ".bat", ".sh", ".msi", ".app", ".dmg"]
const BLOCKED_MIME_PREFIXES = [
  "application/x-msdownload",
  "application/x-ms-installer",
  "application/x-executable",
]

export class UploadError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = "UploadError"
  }
}

export interface InitiateUploadParams {
  workspaceId: string
  userId: string
  folderId?: string | null
  fileName: string
  mimeType: string
  sizeBytes: number
  checksum?: string
}

export interface InitiateUploadResult {
  uploadId: string
  signedUrl?: string
  sessionId?: string
  expiresAt: string
  storageKey: string
  partSize?: number
  totalParts?: number
}

export interface CompleteUploadParams {
  workspaceId: string
  userId: string
  uploadId: string
  fileName: string
  mimeType: string
  folderId?: string | null
  parts?: Array<{ partNumber: number; etag: string; sizeBytes: number }>
}

export interface GetUploadSessionResult {
  uploadId: string
  sessionId: string
  status: string
  totalParts: number
  partSize: number
  partsCompleted: number
  completedParts: Array<{ partNumber: number; etag: string; sizeBytes: number }>
  storageKey: string
  expiresAt: string
}

export interface GetPartSignedUrlsResult {
  uploadId: string
  sessionId: string
  signedUrls: Array<{ partNumber: number; signedUrl: string; expiresAt: string }>
}

interface UploadSessionAccess {
  workspaceId: string
  userId: string
}

export class UploadService {
  constructor(private storage: StorageProvider) {}

  async initiateUpload(params: InitiateUploadParams): Promise<InitiateUploadResult> {
    const db = getDB()

    this.validateFileType(params.fileName, params.mimeType)

    if (params.sizeBytes > MAX_FILE_SIZE) {
      throw new UploadError("FILE_TOO_LARGE", `Max file size is ${String(MAX_FILE_SIZE / 1e9)} GB`)
    }

    const ws = await db
      .select()
      .from(workspace)
      .where(eq(workspace.id, params.workspaceId))
      .get()

    if (!ws) {
      throw new UploadError("WORKSPACE_NOT_FOUND", "Workspace not found")
    }

    const wsBucket = await db
      .select()
      .from(bucket)
      .where(eq(bucket.workspaceId, params.workspaceId))
      .get()

    if (!wsBucket) {
      throw new UploadError("NOT_FOUND", "No storage bucket found for workspace")
    }

    if (params.folderId) {
      const targetFolder = await db
        .select({ id: folder.id })
        .from(folder)
        .where(
          and(
            eq(folder.id, params.folderId),
            eq(folder.workspaceId, params.workspaceId),
            eq(folder.isDeleted, false),
          ),
        )
        .get()

      if (!targetFolder) {
        throw new UploadError("PARENT_NOT_FOUND", "Folder not found")
      }
    }

    const allFiles = await db
      .select()
      .from(fileObject)
      .where(
        and(
          eq(fileObject.workspaceId, params.workspaceId),
          eq(fileObject.isDeleted, false),
        ),
      )
      .all()

    const totalUsed = allFiles.reduce((sum, f) => sum + f.sizeBytes, 0)

    if (totalUsed + params.sizeBytes > ws.storageQuotaBytes) {
      throw new UploadError("QUOTA_EXCEEDED", "Workspace storage quota exceeded")
    }

    const uploadId = crypto.randomUUID()
    const storeKey = `workspace/${params.workspaceId}/files/${crypto.randomUUID()}`
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    const isMultipart = params.sizeBytes > MULTIPART_THRESHOLD

    if (isMultipart) {
      const settingsRow = await db
        .select({ uploadChunkSizeBytes: workspaceSettings.uploadChunkSizeBytes })
        .from(workspaceSettings)
        .where(eq(workspaceSettings.workspaceId, params.workspaceId))
        .get()

      const configuredChunkSize = settingsRow?.uploadChunkSizeBytes ?? MIN_PART_SIZE
      const partSize = Math.max(configuredChunkSize, MIN_PART_SIZE)
      const totalParts = Math.ceil(params.sizeBytes / partSize)

      const multipart = await this.storage.createMultipartUpload(storeKey)
      const sessionId = multipart.uploadId

      await db
        .insert(uploadSession)
        .values({
          id: uploadId,
          workspaceId: params.workspaceId,
          userId: params.userId,
          bucketId: wsBucket.id,
          status: "initiated",
          uploadType: "multipart",
          totalSize: params.sizeBytes,
          storageKey: storeKey,
          totalParts,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run()

      return {
        uploadId,
        sessionId,
        expiresAt,
        storageKey: storeKey,
        partSize,
        totalParts,
      }
    }

    const signedUrl = await this.storage.generateSignedUploadUrl(storeKey)

    await db
      .insert(uploadSession)
      .values({
        id: uploadId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        bucketId: wsBucket.id,
        status: "initiated",
        uploadType: "single",
        totalSize: params.sizeBytes,
        storageKey: storeKey,
        totalParts: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run()

    return {
      uploadId,
      signedUrl,
      expiresAt,
      storageKey: storeKey,
    }
  }

  async getUploadSession(
    sessionId: string,
    access?: UploadSessionAccess,
  ): Promise<GetUploadSessionResult> {
    const db = getDB()

    const session = await db
      .select()
      .from(uploadSession)
      .where(eq(uploadSession.id, sessionId))
      .get()

    if (!session) {
      throw new UploadError("NOT_FOUND", "Upload session not found")
    }
    this.assertSessionAccess(session, access)

    const parts = await db
      .select()
      .from(uploadPart)
      .where(eq(uploadPart.uploadSessionId, sessionId))
      .all()

    return {
      uploadId: session.id,
      sessionId: session.id,
      status: session.status,
      totalParts: session.totalParts,
      partSize: Math.ceil(session.totalSize / session.totalParts),
      partsCompleted: parts.length,
      completedParts: parts.map((p) => ({
        partNumber: p.partNumber,
        etag: p.etag,
        sizeBytes: p.sizeBytes,
      })),
      storageKey: session.storageKey ?? "",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }
  }

  async generatePartSignedUrls(
    sessionId: string,
    partNumbers: number[],
    access?: UploadSessionAccess,
  ): Promise<GetPartSignedUrlsResult> {
    const db = getDB()

    const session = await db
      .select()
      .from(uploadSession)
      .where(eq(uploadSession.id, sessionId))
      .get()

    if (!session) {
      throw new UploadError("NOT_FOUND", "Upload session not found")
    }
    this.assertSessionAccess(session, access)

    if (session.status === "completed" || session.status === "cancelled") {
      throw new UploadError("CONFLICT", `Upload session is ${session.status}`)
    }

    const existingParts = await db
      .select()
      .from(uploadPart)
      .where(
        and(
          eq(uploadPart.uploadSessionId, sessionId),
          inArray(
            uploadPart.partNumber,
            partNumbers,
          ),
        ),
      )
      .all()

    const completedPartNumbers = new Set(existingParts.map((p) => p.partNumber))
    const pendingPartNumbers = partNumbers.filter((n) => !completedPartNumbers.has(n))

    const signedUrls = await Promise.all(
      pendingPartNumbers.map(async (partNumber) => {
        const signedUrl = await this.storage.generateSignedUploadPartUrl(
          session.id,
          partNumber,
          session.storageKey ?? "",
        )
        return {
          partNumber,
          signedUrl,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        }
      }),
    )

    return {
      uploadId: session.id,
      sessionId: session.id,
      signedUrls,
    }
  }

  async completeUpload(params: CompleteUploadParams) {
    const db = getDB()

    const session = await db
      .select()
      .from(uploadSession)
      .where(eq(uploadSession.id, params.uploadId))
      .get()

    if (!session) {
      throw new UploadError("NOT_FOUND", "Upload session not found")
    }

    if (session.status === "completed") {
      throw new UploadError("CONFLICT", "Upload already completed")
    }

    if (session.userId !== params.userId) {
      throw new UploadError("FORBIDDEN", "Cannot complete another user's upload")
    }

    if (session.workspaceId !== params.workspaceId) {
      throw new UploadError("FORBIDDEN", "Upload session belongs to another workspace")
    }

    if (params.folderId) {
      const targetFolder = await db
        .select({ id: folder.id })
        .from(folder)
        .where(
          and(
            eq(folder.id, params.folderId),
            eq(folder.workspaceId, params.workspaceId),
            eq(folder.isDeleted, false),
          ),
        )
        .get()

      if (!targetFolder) {
        throw new UploadError("PARENT_NOT_FOUND", "Folder not found")
      }
    }

    const ext = params.fileName.includes(".")
      ? (params.fileName.split(".").pop()?.toLowerCase() ?? null)
      : null

    const fileId = crypto.randomUUID()
    const now = new Date().toISOString()
    const storedKey = session.storageKey ?? `workspace/${params.workspaceId}/files/${fileId}`

    if (params.parts && params.parts.length > 0) {
      const uniquePartNumbers = new Set(params.parts.map((part) => part.partNumber))
      if (uniquePartNumbers.size !== params.parts.length) {
        throw new UploadError("INVALID_PARTS", "Duplicate upload parts")
      }

      for (const part of params.parts) {
        if (part.partNumber > session.totalParts) {
          throw new UploadError("INVALID_PARTS", "Upload part number is out of range")
        }

        await db
          .insert(uploadPart)
          .values({
            id: crypto.randomUUID(),
            uploadSessionId: session.id,
            partNumber: part.partNumber,
            etag: part.etag,
            sizeBytes: part.sizeBytes,
            uploadedAt: now,
          })
          .run()
      }
    }

    if (session.uploadType === "multipart") {
      const parts = await db
        .select()
        .from(uploadPart)
        .where(eq(uploadPart.uploadSessionId, session.id))
        .all()

      if (parts.length !== session.totalParts) {
        throw new UploadError(
          "INCOMPLETE_UPLOAD",
          `Expected ${String(session.totalParts)} parts, but only ${String(parts.length)} were uploaded`,
        )
      }

      const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber)
      await this.storage.completeMultipartUpload(
        session.id,
        storedKey,
        sortedParts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
      )
    }

    await db
      .insert(fileObject)
      .values({
        id: fileId,
        workspaceId: params.workspaceId,
        bucketId: session.bucketId,
        folderId: params.folderId ?? null,
        ownerId: params.userId,
        storageKey: storedKey,
        originalName: params.fileName,
        mimeType: params.mimeType,
        extension: ext,
        sizeBytes: session.totalSize,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    await db
      .update(uploadSession)
      .set({
        status: "completed",
        uploadedSize: session.totalSize,
        partsCompleted: params.parts?.length ?? 1,
        updatedAt: now,
      })
      .where(eq(uploadSession.id, params.uploadId))
      .run()

    await db
      .insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        workspaceId: params.workspaceId,
        actorId: params.userId,
        action: "file.upload",
        resourceType: "file",
        resourceId: fileId,
        createdAt: now,
      })
      .run()

    const created = await db
      .select()
      .from(fileObject)
      .where(eq(fileObject.id, fileId))
      .get()

    if (!created) {
      throw new UploadError("INTERNAL_ERROR", "Failed to create file record")
    }

    return created
  }

  async cancelUpload(uploadId: string, access?: UploadSessionAccess): Promise<void> {
    const db = getDB()

    const session = await db
      .select()
      .from(uploadSession)
      .where(eq(uploadSession.id, uploadId))
      .get()

    if (!session) {
      throw new UploadError("NOT_FOUND", "Upload session not found")
    }
    this.assertSessionAccess(session, access)

    if (session.status === "completed") {
      throw new UploadError("CONFLICT", "Upload already completed")
    }

    if (session.uploadType === "multipart" && session.storageKey) {
      try {
        await this.storage.abortMultipartUpload(uploadId, session.storageKey)
      } catch {
        // Ignore abort errors — the multipart may already be cleaned up
      }
    }

    await db
      .update(uploadSession)
      .set({
        status: "cancelled",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(uploadSession.id, uploadId))
      .run()
  }

  private validateFileType(fileName: string, mimeType: string): void {
    const extPart = fileName.split(".").pop()?.toLowerCase()
    const ext = fileName.includes(".") && extPart ? `.${extPart}` : ""

    if (ext && BLOCKED_EXTENSIONS.includes(ext)) {
      throw new UploadError("BLOCKED_EXTENSION", `File type ${ext} is not allowed`)
    }

    const blocked = BLOCKED_MIME_PREFIXES.some((p) => mimeType.startsWith(p))
    if (blocked) {
      throw new UploadError("BLOCKED_MIME", `MIME type ${mimeType} is not allowed`)
    }

    if (fileName.includes("\0") || fileName.includes("..")) {
      throw new UploadError("INVALID_NAME", "File name contains invalid characters")
    }
  }

  private assertSessionAccess(
    session: { workspaceId: string; userId: string },
    access?: UploadSessionAccess,
  ): void {
    if (!access) return

    if (session.workspaceId !== access.workspaceId || session.userId !== access.userId) {
      throw new UploadError("FORBIDDEN", "Upload session is not accessible")
    }
  }
}
