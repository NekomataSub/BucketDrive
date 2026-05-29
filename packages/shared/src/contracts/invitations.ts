import { z } from "zod"
import { AuthUserId, PaginatedResponseSchema, WorkspaceRole } from "../schemas/common"

export const InvitationStatus = z.enum(["pending", "accepted", "revoked", "expired"])
export type InvitationStatus = z.infer<typeof InvitationStatus>

export const CreateInvitationRequest = z.object({
  email: z.string().email(),
  role: WorkspaceRole.exclude(["owner"]),
})

export const InvitationListItemSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  role: WorkspaceRole,
  invitedBy: AuthUserId,
  invitedByName: z.string(),
  status: InvitationStatus,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
})

export const ListInvitationsResponse = PaginatedResponseSchema(InvitationListItemSchema)

export const InvitationDetailResponse = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  workspaceName: z.string(),
  workspaceSlug: z.string(),
  email: z.string().email(),
  role: WorkspaceRole,
  invitedByName: z.string(),
  status: InvitationStatus,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
})

export const AcceptInvitationRequest = z.object({
  token: z.string().min(1),
})

export const AcceptInvitationResponse = z.object({
  success: z.literal(true),
  workspaceId: z.string().uuid(),
  role: WorkspaceRole,
})

export const RevokeInvitationResponse = z.object({
  success: z.literal(true),
  invitationId: z.string().uuid(),
})

export const InitiateOwnershipTransferRequest = z.object({
  newOwnerId: AuthUserId,
})

export const AcceptOwnershipTransferRequest = z.object({
  token: z.string().min(1),
})

export const OwnershipTransferResponse = z.object({
  success: z.literal(true),
  workspaceId: z.string().uuid(),
  previousOwnerId: AuthUserId,
  newOwnerId: AuthUserId,
})

export type InvitationListItem = z.infer<typeof InvitationListItemSchema>
export type InvitationDetail = z.infer<typeof InvitationDetailResponse>
