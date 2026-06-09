import { z } from "zod"
import { WorkspaceRole } from "../schemas/common"

export const PlatformSettingsResponse = z.object({
  platformName: z.string(),
  enablePublicSignup: z.boolean(),
  platformLogoUrl: z.url().or(z.string().startsWith("/")).nullable(),
  faviconUrl: z.url().or(z.string().startsWith("/")).nullable(),
})

export const UpdatePlatformSettingsRequest = z.object({
  platformName: z.string().min(1).max(100).optional(),
  enablePublicSignup: z.boolean().optional(),
})

export const UpdatePlatformSettingsResponse = z.object({
  success: z.literal(true),
  settings: PlatformSettingsResponse,
})

export const UploadPlatformAssetResponse = z.object({
  success: z.literal(true),
  settings: PlatformSettingsResponse,
})

export const BucketResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  role: WorkspaceRole,
  storageQuotaBytes: z.number(),
  createdAt: z.iso.datetime(),
})

export const PlatformJoinResponse = z.object({
  success: z.literal(true),
  role: WorkspaceRole,
})

export const CreatePlatformInvitationRequest = z.object({
  email: z.email(),
  role: WorkspaceRole.exclude(["owner"]),
})

export const PlatformInvitationListItemSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: WorkspaceRole,
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  inviteLink: z.string().optional(),
})

export const ListPlatformInvitationsResponse = z.object({
  data: z.array(PlatformInvitationListItemSchema),
})

export const CreatePlatformInvitationResponse = z.object({
  id: z.uuid(),
  email: z.email(),
  role: WorkspaceRole,
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  inviteLink: z.string(),
})

export const AcceptPlatformInvitationResponse = z.object({
  success: z.literal(true),
  role: WorkspaceRole,
})

export type PlatformSettings = z.infer<typeof PlatformSettingsResponse>
export type BucketResponseType = z.infer<typeof BucketResponse>
