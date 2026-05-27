import { z } from "zod"
import { WorkspaceRole } from "../schemas/common"

export const PlatformSettingsResponse = z.object({
  platformName: z.string(),
  defaultWorkspaceId: z.string().uuid().nullable(),
  allowUserWorkspaceCreation: z.boolean(),
  enablePublicSignup: z.boolean(),
})

export const UpdatePlatformSettingsRequest = z.object({
  platformName: z.string().min(1).max(100).optional(),
  defaultWorkspaceId: z.string().uuid().optional().nullable(),
  allowUserWorkspaceCreation: z.boolean().optional(),
  enablePublicSignup: z.boolean().optional(),
})

export const UpdatePlatformSettingsResponse = z.object({
  success: z.literal(true),
  settings: PlatformSettingsResponse,
})

export const CreateWorkspaceRequest = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens only").optional(),
})

export const CreateWorkspaceResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  ownerId: z.string().uuid(),
  storageQuotaBytes: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const PlatformJoinResponse = z.object({
  success: z.literal(true),
  workspaceId: z.string().uuid(),
  role: WorkspaceRole,
})

export const CreatePlatformInvitationRequest = z.object({
  email: z.string().email(),
  role: WorkspaceRole.exclude(["owner"]),
  canCreateWorkspaces: z.boolean().default(false),
})

export const PlatformInvitationListItemSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: WorkspaceRole,
  canCreateWorkspaces: z.boolean(),
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  inviteLink: z.string().optional(),
})

export const ListPlatformInvitationsResponse = z.object({
  data: z.array(PlatformInvitationListItemSchema),
})

export const CreatePlatformInvitationResponse = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: WorkspaceRole,
  canCreateWorkspaces: z.boolean(),
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  inviteLink: z.string(),
})

export const AcceptPlatformInvitationResponse = z.object({
  success: z.literal(true),
  workspaceId: z.string().uuid(),
  role: WorkspaceRole,
})

export type PlatformSettings = z.infer<typeof PlatformSettingsResponse>
export type CreateWorkspaceRequestType = z.infer<typeof CreateWorkspaceRequest>
export type CreateWorkspaceResponseType = z.infer<typeof CreateWorkspaceResponse>
