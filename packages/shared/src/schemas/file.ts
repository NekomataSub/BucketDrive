import { z } from "zod"
import { AuthUserId } from "./common"

export const FileObjectSchema = z.object({
  id: z.uuid(),
  bucketId: z.uuid(),
  folderId: z.uuid().nullable(),
  ownerId: AuthUserId,
  storageKey: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  extension: z.string().nullable(),
  sizeBytes: z.number().int().min(0),
  checksum: z.string().nullable(),
  thumbnailKey: z.string().nullable(),
  metadata: z.string().nullable(),
  isDeleted: z.boolean(),
  deletedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  tags: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        color: z.string(),
      }),
    )
    .optional(),
  isFavorited: z.boolean().optional(),
})

export type FileObject = z.infer<typeof FileObjectSchema>
