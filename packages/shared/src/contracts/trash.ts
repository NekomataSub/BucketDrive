import { z } from "zod"
import { PaginatedResponseSchema } from "../schemas/common"

export const TrashSortField = z.enum(["deleted_at", "name", "location", "size"])

export const ListTrashRequest = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  sort: TrashSortField.default("deleted_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const TrashItemBaseSchema = z.object({
  resourceType: z.enum(["file", "folder"]),
  id: z.uuid(),
  name: z.string(),
  originalLocation: z.string(),
  deletedAt: z.iso.datetime(),
  daysRemaining: z.number().int().min(0),
})

export const TrashFileItemSchema = TrashItemBaseSchema.extend({
  resourceType: z.literal("file"),
  mimeType: z.string(),
  sizeBytes: z.number().int().min(0),
  extension: z.string().nullable(),
})

export const TrashFolderItemSchema = TrashItemBaseSchema.extend({
  resourceType: z.literal("folder"),
  path: z.string(),
})

export const TrashItemSchema = z.union([TrashFileItemSchema, TrashFolderItemSchema])

export const ListTrashResponse = PaginatedResponseSchema(TrashItemSchema)

export const RestoreFileResponse = z.object({
  success: z.literal(true),
  fileId: z.uuid(),
  restoredToFolderId: z.uuid().nullable(),
  restoredName: z.string(),
  restoredToRoot: z.boolean(),
})

export const RestoreFolderResponse = z.object({
  success: z.literal(true),
  folderId: z.uuid(),
  restoredToFolderId: z.uuid().nullable(),
  restoredName: z.string(),
  restoredToRoot: z.boolean(),
})

export const PermanentlyDeleteFileResponse = z.object({
  success: z.literal(true),
  fileId: z.uuid(),
})

export const PermanentlyDeleteFolderResponse = z.object({
  success: z.literal(true),
  folderId: z.uuid(),
})

export type TrashItem = z.infer<typeof TrashItemSchema>
