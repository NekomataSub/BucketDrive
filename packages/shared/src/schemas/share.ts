import { z } from "zod"
import { AuthUserId, ShareType, WorkspaceRole } from "./common"

export const ShareLinkSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  resourceType: z.enum(["file", "folder"]),
  resourceId: z.string().uuid(),
  shareType: ShareType,
  createdBy: AuthUserId,
  passwordHash: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  accessCount: z.number().int().min(0),
  downloadCount: z.number().int().min(0),
  lastAccessedAt: z.string().datetime().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type ShareLink = z.infer<typeof ShareLinkSchema>

export const SharePermissionSchema = z.enum(["read", "download"])
export type SharePermission = z.infer<typeof SharePermissionSchema>

export const ShareDashboardItemSchema = ShareLinkSchema.extend({
  resourceName: z.string(),
  createdByName: z.string(),
  permissions: z.array(SharePermissionSchema),
  hasPassword: z.boolean(),
  isLocked: z.boolean(),
})

export type ShareDashboardItem = z.infer<typeof ShareDashboardItemSchema>

export const SharesListScopeSchema = z.enum(["mine", "workspace", "shared_with_me"])
export type SharesListScope = z.infer<typeof SharesListScopeSchema>

export const SharesListMetaSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  scope: SharesListScopeSchema,
  currentUserRole: WorkspaceRole,
  canManageAll: z.boolean(),
})

export type SharesListMeta = z.infer<typeof SharesListMetaSchema>
