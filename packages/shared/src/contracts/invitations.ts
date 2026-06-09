import { z } from "zod"
import { AuthUserId, PaginatedResponseSchema, WorkspaceRole } from "../schemas/common"

export const InvitationStatus = z.enum(["pending", "accepted", "revoked", "expired"])
export type InvitationStatus = z.infer<typeof InvitationStatus>

export const CreateInvitationRequest = z.object({
  email: z.email(),
  role: WorkspaceRole.exclude(["owner"]),
})

export const InvitationListItemSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: WorkspaceRole,
  invitedBy: AuthUserId,
  invitedByName: z.string(),
  status: InvitationStatus,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
})

export const ListInvitationsResponse = PaginatedResponseSchema(InvitationListItemSchema)

export const InvitationDetailResponse = z.object({
  id: z.uuid(),
  email: z.email(),
  role: WorkspaceRole,
  invitedByName: z.string(),
  status: InvitationStatus,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
})

export const AcceptInvitationRequest = z.object({
  token: z.string().min(1),
})

export const AcceptInvitationResponse = z.object({
  success: z.literal(true),
  role: WorkspaceRole,
})

export const RevokeInvitationResponse = z.object({
  success: z.literal(true),
  invitationId: z.uuid(),
})

export const InitiateOwnershipTransferRequest = z.object({
  newOwnerId: AuthUserId,
})

export const AcceptOwnershipTransferRequest = z.object({
  token: z.string().min(1),
})

export const OwnershipTransferResponse = z.object({
  success: z.literal(true),
  previousOwnerId: AuthUserId,
  newOwnerId: AuthUserId,
})

export type InvitationListItem = z.infer<typeof InvitationListItemSchema>
export type InvitationDetail = z.infer<typeof InvitationDetailResponse>
