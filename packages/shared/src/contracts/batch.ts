import { z } from "zod"

const BatchResourceIdsBaseSchema = z.object({
  files: z.array(z.string().uuid()).max(100).default([]),
  folders: z.array(z.string().uuid()).max(100).default([]),
})

const BatchResourceIdsSchema = BatchResourceIdsBaseSchema.refine(
  (body) => body.files.length > 0 || body.folders.length > 0,
  {
    message: "Batch request requires at least one file or folder",
  },
)

export const BatchTrashRequest = BatchResourceIdsSchema
export const BatchRestoreRequest = BatchResourceIdsSchema
export const BatchPermanentDeleteRequest = BatchResourceIdsSchema

export const BatchMoveRequest = BatchResourceIdsBaseSchema.extend({
  targetFolderId: z.string().uuid().nullable(),
}).refine((body) => body.files.length > 0 || body.folders.length > 0, {
  message: "Batch request requires at least one file or folder",
})

export const BatchRevokeSharesRequest = z
  .object({
    shareIds: z.array(z.string().uuid()).max(100),
  })
  .refine((body) => body.shareIds.length > 0, {
    message: "Batch request requires at least one share",
  })

export const BatchProcessedItemSchema = z.object({
  resourceType: z.enum(["file", "folder", "share"]),
  id: z.string().uuid(),
})

export const BatchFailureSchema = BatchProcessedItemSchema.extend({
  code: z.string(),
  message: z.string(),
})

export const BatchOperationResponse = z.object({
  success: z.boolean(),
  processed: z.array(BatchProcessedItemSchema),
  failed: z.array(BatchFailureSchema),
})

export type BatchOperationResponse = z.infer<typeof BatchOperationResponse>
