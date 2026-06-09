import { z } from "zod"
import { AuthUserId } from "./common"

export const FolderSchema = z.object({
  id: z.uuid(),
  parentFolderId: z.uuid().nullable(),
  name: z.string(),
  path: z.string(),
  createdBy: AuthUserId,
  isDeleted: z.boolean(),
  deletedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Folder = z.infer<typeof FolderSchema>
