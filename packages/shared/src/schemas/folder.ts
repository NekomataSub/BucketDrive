import { z } from "zod"
import { AuthUserId } from "./common"

export const FolderSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  parentFolderId: z.string().uuid().nullable(),
  name: z.string(),
  path: z.string(),
  createdBy: AuthUserId,
  isDeleted: z.boolean(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Folder = z.infer<typeof FolderSchema>
