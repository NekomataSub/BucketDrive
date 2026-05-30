import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

export const workspace = sqliteTable("workspace", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: text("owner_id").notNull(),
  storageQuotaBytes: integer("storage_quota_bytes").notNull().default(10 * 1024 * 1024 * 1024),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  isPlatformDefault: integer("is_platform_default", { mode: "boolean" }).notNull().default(false),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
})

export const workspaceSettings = sqliteTable("workspace_settings", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" })
    .unique(),
  defaultShareExpirationDays: integer("default_share_expiration_days").notNull().default(30),
  enablePublicSignup: integer("enable_public_signup", { mode: "boolean" }).notNull().default(false),
  trashRetentionDays: integer("trash_retention_days").notNull().default(30),
  maxFileSizeBytes: integer("max_file_size_bytes").notNull().default(5 * 1024 * 1024 * 1024),
  uploadChunkSizeBytes: integer("upload_chunk_size_bytes").notNull().default(5 * 1024 * 1024),
  allowedMimeTypes: text("allowed_mime_types"),
  brandingLogoUrl: text("branding_logo_url"),
  brandingName: text("branding_name"),
  r2PublicBaseUrl: text("r2_public_base_url"),
  r2LastSyncAt: text("r2_last_sync_at"),
  r2SyncStatus: text("r2_sync_status").notNull().default("idle"),
  r2SyncError: text("r2_sync_error"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
})

export const bucket = sqliteTable("bucket", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  provider: text("provider").notNull().default("r2"),
  region: text("region"),
  visibility: text("visibility").notNull().default("private"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
})

export const fileObject = sqliteTable("file_object", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id),
  bucketId: text("bucket_id")
    .notNull()
    .references(() => bucket.id),
  folderId: text("folder_id"),
  ownerId: text("owner_id").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  extension: text("extension"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  checksum: text("checksum"),
  thumbnailKey: text("thumbnail_key"),
  metadata: text("metadata"),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
})

export const workspaceMember = sqliteTable("workspace_member", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("viewer"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
})

export const folder = sqliteTable("folder", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id),
  parentFolderId: text("parent_folder_id"),
  name: text("name").notNull(),
  path: text("path").notNull(),
  createdBy: text("created_by").notNull(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
})

export const workspaceInvitation = sqliteTable("workspace_invitation", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  role: text("role").notNull().default("viewer"),
  canCreateWorkspaces: integer("can_create_workspaces", { mode: "boolean" }).notNull().default(false),
  invitedBy: text("invited_by").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
})

export const platformSettings = sqliteTable("platform_settings", {
  id: text("id").primaryKey(),
  defaultWorkspaceId: text("default_workspace_id")
    .references(() => workspace.id, { onDelete: "set null" }),
  allowUserWorkspaceCreation: integer("allow_user_workspace_creation", { mode: "boolean" }).notNull().default(false),
  enablePublicSignup: integer("enable_public_signup", { mode: "boolean" }).notNull().default(true),
  platformName: text("platform_name").notNull().default("BucketDrive"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
})
