import { z } from "zod"
import {
  ShareLinkSchema,
  ShareDashboardItemSchema,
  SharesListMetaSchema,
  SharesListScopeSchema,
} from "../schemas/share"

export const CreateShareRequest = z.object({
  resourceId: z.string().uuid(),
  resourceType: z.enum(["file", "folder"]),
  shareType: z.enum(["internal", "external_direct", "external_explorer"]),
  password: z.string().min(4).max(128).optional(),
  expiresAt: z.string().datetime().optional(),
  permissions: z.array(z.enum(["read", "download"])).optional(),
})

export const ListSharesRequest = z.object({
  scope: SharesListScopeSchema.default("mine"),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const ListSharesResponse = z.object({
  data: z.array(ShareDashboardItemSchema),
  meta: SharesListMetaSchema,
})

export const UpdateShareRequest = z.object({
  password: z.string().min(4).max(128).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
})

export const ShareAccessRequest = z.object({
  password: z.string().optional(),
})

export const ShareAccessResponse = z.object({
  resourceType: z.enum(["file", "folder"]),
  resourceName: z.string(),
  signedUrl: z.string().url().optional(),
  publicUrl: z.string().url().optional(),
  files: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number(),
      })
    )
    .optional(),
  folders: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
      })
    )
    .optional(),
  brandingLogoUrl: z.string().url().nullable(),
  brandingName: z.string().nullable(),
})

export const ShareInfoResponse = z.object({
  id: z.string().uuid(),
  resourceType: z.enum(["file", "folder"]),
  resourceName: z.string(),
  shareType: ShareLinkSchema.shape.shareType,
  hasPassword: z.boolean(),
  isActive: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string(),
  brandingLogoUrl: z.string().url().nullable(),
  brandingName: z.string().nullable(),
})

export const ShareBrowseRequest = z.object({
  folderId: z.string().uuid().optional(),
  password: z.string().optional(),
})

export const ShareBrowseResponse = z.object({
  resourceName: z.string(),
  currentFolderId: z.string().uuid().nullable(),
  breadcrumbs: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
    })
  ),
  files: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number(),
    })
  ),
  folders: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
    })
  ),
  brandingLogoUrl: z.string().url().nullable(),
  brandingName: z.string().nullable(),
})
