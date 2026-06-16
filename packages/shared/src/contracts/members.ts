import { z } from "zod"
import { AuthUserId, PaginatedResponseSchema, WorkspaceRole } from "../schemas/common"

export const BucketMemberListItemSchema = z.object({
  id: AuthUserId,
  userId: AuthUserId,
  role: WorkspaceRole,
  email: z.email(),
  name: z.string(),
  image: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

export const WorkspaceMemberListItemSchema = BucketMemberListItemSchema
export const ListMembersResponse = PaginatedResponseSchema(BucketMemberListItemSchema)

export const AddMemberRequest = z.object({
  email: z.email(),
  role: WorkspaceRole.exclude(["owner"]),
})

export const UpdateMemberRoleRequest = z.object({
  role: WorkspaceRole.exclude(["owner"]),
})

export const RemoveMemberResponse = z.object({
  success: z.literal(true),
  memberId: AuthUserId,
})

export type WorkspaceMemberListItem = z.infer<typeof WorkspaceMemberListItemSchema>
