import { z } from "zod"
import { AuthUserId, PaginatedResponseSchema, WorkspaceRole } from "../schemas/common"

export const WorkspaceMemberListItemSchema = z.object({
  id: z.string().uuid(),
  userId: AuthUserId,
  workspaceId: z.string().uuid(),
  role: WorkspaceRole,
  email: z.string().email(),
  name: z.string(),
  image: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export const ListMembersResponse = PaginatedResponseSchema(WorkspaceMemberListItemSchema)

export const AddMemberRequest = z.object({
  email: z.string().email(),
  role: WorkspaceRole.exclude(["owner"]),
})

export const UpdateMemberRoleRequest = z.object({
  role: WorkspaceRole,
})

export const RemoveMemberResponse = z.object({
  success: z.literal(true),
  memberId: z.string().uuid(),
})

export type WorkspaceMemberListItem = z.infer<typeof WorkspaceMemberListItemSchema>
