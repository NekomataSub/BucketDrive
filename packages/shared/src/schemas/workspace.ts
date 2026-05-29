import { z } from "zod"
import { AuthUserId, WorkspaceRole } from "./common"

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  ownerId: AuthUserId,
  role: WorkspaceRole,
  storageQuotaBytes: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Workspace = z.infer<typeof WorkspaceSchema>

export const WorkspaceMemberSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: AuthUserId,
  role: WorkspaceRole,
  user: z.object({
    id: AuthUserId,
    email: z.string().email(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  joinedAt: z.string().datetime(),
})

export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>

export const WorkspaceSettingsSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  defaultShareExpirationDays: z.number().int().min(1).max(365).default(30),
  enablePublicSignup: z.boolean().default(false),
  trashRetentionDays: z.number().int().min(1).max(90).default(30),
  maxFileSizeBytes: z.number().int().positive().default(5 * 1024 * 1024 * 1024),
  uploadChunkSizeBytes: z.number().int().positive().default(5 * 1024 * 1024),
  storageQuotaBytes: z.number().int().positive().default(10 * 1024 * 1024 * 1024),
  allowedMimeTypes: z.array(z.string()).default([]),
  brandingLogoUrl: z.string().url().nullable().default(null),
  brandingName: z.string().nullable().default(null),
})

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>

export const StorageInfoSchema = z.object({
  totalBytes: z.number(),
  usedBytes: z.number(),
  trashBytes: z.number(),
  quotaBytes: z.number().nullable(),
  largestFiles: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    sizeBytes: z.number(),
  })),
  fileCount: z.number(),
  folderCount: z.number(),
})

export type StorageInfo = z.infer<typeof StorageInfoSchema>
