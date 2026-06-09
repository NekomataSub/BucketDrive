import { z } from "zod"
import { FolderSchema } from "../schemas/folder"
import { PaginatedResponseSchema } from "../schemas/common"

export const ListFoldersRequest = z.object({
  parentFolderId: z.uuid().nullable().optional(),
})

export const ListFoldersResponse = PaginatedResponseSchema(FolderSchema)

export const BreadcrumbItemSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string(),
})

export const BreadcrumbResponse = z.array(BreadcrumbItemSchema)

export const CreateFolderRequest = z.object({
  name: z.string().min(1).max(255),
  parentFolderId: z.uuid().nullable().optional(),
})

export const UpdateFolderRequest = z.object({
  name: z.string().min(1).max(255).optional(),
  parentFolderId: z.uuid().nullable().optional(),
})

export const DeleteFolderResponse = z.object({
  success: z.literal(true),
  folderId: z.uuid(),
})

export type BreadcrumbItem = z.infer<typeof BreadcrumbItemSchema>
