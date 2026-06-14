import { z } from "zod"
import { PaginatedResponseSchema } from "../schemas/common"
import { BucketSettingsSchema } from "../schemas/workspace"

export const DashboardOverviewSummarySchema = z.object({
  totalFiles: z.number().int().min(0),
  totalFolders: z.number().int().min(0),
  memberCount: z.number().int().min(0),
  activeShares: z.number().int().min(0),
  usedStorageBytes: z.number().int().min(0),
  quotaBytes: z.number().int().positive(),
})

export const StorageTrendPointSchema = z.object({
  date: z.string(),
  usedBytes: z.number().int().min(0),
})

export const LargestFileSchema = z.object({
  id: z.uuid(),
  folderId: z.uuid().nullable(),
  name: z.string(),
  sizeBytes: z.number().int().min(0),
  mimeType: z.string(),
  createdAt: z.iso.datetime(),
})

export const RecentActivityItemSchema = z.object({
  id: z.uuid(),
  actorId: z.string(),
  actorName: z.string().nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

export const DashboardOverviewResponse = z.object({
  summary: DashboardOverviewSummarySchema,
  storageTrend: z.array(StorageTrendPointSchema),
  largestFiles: z.array(LargestFileSchema),
  recentActivity: z.array(RecentActivityItemSchema),
})

export const DashboardAuditRequest = z.object({
  actorId: z.string().optional(),
  action: z.string().trim().min(1).max(120).optional(),
  resourceType: z.string().trim().min(1).max(80).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export const DashboardAuditItemSchema = z.object({
  id: z.uuid(),
  actorId: z.string(),
  actorName: z.string().nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
})

export const DashboardAuditResponse = PaginatedResponseSchema(DashboardAuditItemSchema)

export const DashboardSettingsResponse = BucketSettingsSchema

export const UpdateDashboardSettingsRequest = BucketSettingsSchema.pick({
  defaultShareExpirationDays: true,
  enablePublicSignup: true,
  trashRetentionDays: true,
  maxFileSizeBytes: true,
  uploadChunkSizeBytes: true,
  storageQuotaBytes: true,
  allowedMimeTypes: true,
  brandingLogoUrl: true,
  brandingName: true,
  r2PublicBaseUrl: true,
})

export type DashboardOverview = z.infer<typeof DashboardOverviewResponse>
export type DashboardAuditItem = z.infer<typeof DashboardAuditItemSchema>
