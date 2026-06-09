import { z } from "zod"
import { AuthUserId, WorkspaceRole } from "./common"

export const BucketSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: WorkspaceRole.optional(),
  storageQuotaBytes: z.number().int().positive(),
  createdAt: z.iso.datetime(),
})

export type Bucket = z.infer<typeof BucketSchema>
export const WorkspaceSchema = BucketSchema
export type Workspace = Bucket

export const BucketMemberSchema = z.object({
  id: z.uuid(),
  userId: AuthUserId,
  role: WorkspaceRole,
  user: z.object({
    id: AuthUserId,
    email: z.email(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  joinedAt: z.iso.datetime(),
})

export type BucketMember = z.infer<typeof BucketMemberSchema>
export const WorkspaceMemberSchema = BucketMemberSchema
export type WorkspaceMember = BucketMember

export const BucketSettingsSchema = z.object({
  id: z.uuid(),
  bucketId: z.uuid(),
  defaultShareExpirationDays: z.number().int().min(1).max(365).default(30),
  enablePublicSignup: z.boolean().default(false),
  trashRetentionDays: z.number().int().min(1).max(90).default(30),
  maxFileSizeBytes: z
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024 * 1024),
  uploadChunkSizeBytes: z
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024),
  storageQuotaBytes: z
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024 * 1024),
  allowedMimeTypes: z.array(z.string()).default([]),
  brandingLogoUrl: z.url().nullable().default(null),
  brandingLogoAssetUrl: z.url().or(z.string().startsWith("/")).nullable().default(null),
  brandingName: z.string().nullable().default(null),
  r2PublicBaseUrl: z.url().nullable().default(null),
  r2LastSyncAt: z.iso.datetime().nullable().default(null),
  r2SyncStatus: z.enum(["idle", "syncing", "failed"]).default("idle"),
  r2SyncError: z.string().nullable().default(null),
})

export type BucketSettings = z.infer<typeof BucketSettingsSchema>
export const WorkspaceSettingsSchema = BucketSettingsSchema
export type WorkspaceSettings = BucketSettings

export const StorageInfoSchema = z.object({
  totalBytes: z.number(),
  usedBytes: z.number(),
  trashBytes: z.number(),
  quotaBytes: z.number().nullable(),
  largestFiles: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      sizeBytes: z.number(),
    }),
  ),
  fileCount: z.number(),
  folderCount: z.number(),
})

export type StorageInfo = z.infer<typeof StorageInfoSchema>
