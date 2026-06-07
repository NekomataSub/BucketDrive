import { z } from "zod"
import { FileObjectSchema } from "../schemas/file"
import { PaginatedResponseSchema } from "../schemas/common"

export const ListFilesRequest = z.object({
  folderId: z.string().uuid().nullable().optional(),
  sort: z.enum(["name", "created_at", "size", "type"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  view: z.enum(["grid", "list"]).default("grid"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const ListFilesResponse = PaginatedResponseSchema(FileObjectSchema)

export const InitiateUploadRequest = z.object({
  folderId: z.string().uuid().nullable().optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  checksum: z.string().optional(),
})

export const InitiateUploadResponse = z.object({
  uploadId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  signedUrl: z.string().url().optional(),
  expiresAt: z.string().datetime(),
  storageKey: z.string(),
  partSize: z.number().optional(),
  totalParts: z.number().optional(),
})

export const CompleteUploadRequest = z.object({
  uploadId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string(),
  folderId: z.string().uuid().nullable().optional(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().positive(),
        etag: z.string(),
        sizeBytes: z.number().int().positive(),
      }),
    )
    .optional(),
})

export const DownloadUrlResponse = z.object({
  signedUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  fileName: z.string(),
  publicUrl: z.string().url().optional(),
})

export const UpdateFileRequest = z.object({
  name: z.string().min(1).max(255).optional(),
  folderId: z.string().uuid().nullable().optional(),
})

export const UpdateFileTagsRequest = z.object({
  tagIds: z.array(z.string().uuid()),
})

export const UpdateFileTagsResponse = FileObjectSchema

export const ToggleFavoriteResponse = z.object({
  fileId: z.string().uuid(),
  isFavorited: z.boolean(),
})

export const DeleteFileResponse = z.object({
  success: z.literal(true),
  fileId: z.string().uuid(),
})

export const RenameFileRequest = z.object({
  name: z.string().min(1).max(255),
})

export const PreviewUrlResponse = z.object({
  signedUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  fileName: z.string(),
  mimeType: z.string(),
})

export const ThumbnailUrlResponse = z.object({
  signedUrl: z.string().url(),
  expiresAt: z.string().datetime(),
})

export const GetUploadSessionResponse = z.object({
  uploadId: z.string().uuid(),
  sessionId: z.string().uuid(),
  status: z.enum(["initiated", "uploading", "completed", "cancelled"]),
  totalParts: z.number().int(),
  partSize: z.number().int(),
  partsCompleted: z.number().int(),
  completedParts: z.array(
    z.object({
      partNumber: z.number().int(),
      etag: z.string(),
      sizeBytes: z.number().int(),
    }),
  ),
  storageKey: z.string(),
  expiresAt: z.string().datetime(),
})

export const GetUploadPartSignedUrlRequest = z.object({
  partNumbers: z.array(z.number().int().min(1)),
})

export const GetUploadPartSignedUrlResponse = z.object({
  uploadId: z.string().uuid(),
  sessionId: z.string().uuid(),
  signedUrls: z.array(
    z.object({
      partNumber: z.number().int(),
      signedUrl: z.string().url(),
      expiresAt: z.string().datetime(),
    }),
  ),
})

export const CancelUploadResponse = z.object({
  success: z.boolean(),
  message: z.string(),
})

export const BatchUploadItemRequest = z.object({
  clientId: z.string().min(1),
  relativePath: z.string().min(1),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  checksum: z.string().optional(),
})

export const BatchUploadRequest = z
  .object({
    items: z.array(BatchUploadItemRequest).max(100),
    parentFolderId: z.string().uuid().nullable().optional(),
    emptyFolders: z.array(z.string().min(1)).max(100).optional(),
  })
  .refine((body) => body.items.length > 0 || (body.emptyFolders?.length ?? 0) > 0, {
    message: "Batch upload requires at least one file or folder",
  })

export const BatchUploadFolderCreated = z.object({
  id: z.string().uuid(),
  path: z.string(),
})

export const BatchUploadItemResponse = z.object({
  clientId: z.string(),
  fileId: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
  uploadId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  signedUrl: z.string().url().optional(),
  expiresAt: z.string().datetime(),
  storageKey: z.string(),
  partSize: z.number().optional(),
  totalParts: z.number().optional(),
})

export const BatchUploadResponse = z.object({
  folders: z.array(BatchUploadFolderCreated),
  items: z.array(BatchUploadItemResponse),
})

export const ImportR2Request = z.object({
  prefix: z.string().min(1).optional(),
})

export const ImportR2Response = z.object({
  scanned: z.number().int().min(0),
  imported: z.number().int().min(0),
  updated: z.number().int().min(0),
  deleted: z.number().int().min(0),
  skipped: z.number().int().min(0),
  failed: z.number().int().min(0),
})
