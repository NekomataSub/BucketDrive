import { z } from "zod"

export const ErrorCode = z.enum([
  "UNAUTHORIZED",
  "SESSION_EXPIRED",
  "INVALID_CREDENTIALS",
  "SESSION_REVOKED",
  "FORBIDDEN",
  "ACCESS_DENIED",
  "OWNER_REQUIRED",
  "ROLE_TOO_LOW",
  "NOT_FOUND",
  "FILE_NOT_FOUND",
  "FOLDER_NOT_FOUND",
  "BUCKET_NOT_FOUND",
  "CONFLICT",
  "FOLDER_EXISTS",
  "FILE_EXISTS",
  "USER_ALREADY_MEMBER",
  "RESOURCE_DELETED",
  "VALIDATION_ERROR",
  "INVALID_UUID",
  "REQUIRED_FIELD",
  "INVALID_EMAIL",
  "FILE_TOO_LARGE",
  "QUOTA_EXCEEDED",
  "BLOCKED_EXTENSION",
  "BLOCKED_MIME",
  "SHARE_NOT_FOUND",
  "SHARE_EXPIRED",
  "SHARE_REVOKED",
  "SHARE_LOCKED",
  "INVALID_PASSWORD",
  "PASSWORD_REQUIRED",
  "RATE_LIMITED",
  "LOGIN_RATE_LIMITED",
  "SHARE_PASSWORD_RATE_LIMITED",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
  "STORAGE_ERROR",
  "R2_AUTH_FAILED",
  "R2_BUCKET_NOT_FOUND",
  "R2_LIST_FAILED",
  "R2_IMPORT_FAILED",
])

export type ErrorCode = z.infer<typeof ErrorCode>

export const ApiErrorSchema = z.object({
  code: ErrorCode,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
})

export type ApiError = z.infer<typeof ApiErrorSchema>

export const PaginationMetaSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
})

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>

export function PaginatedResponseSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    meta: PaginationMetaSchema,
  })
}

export const SortDirection = z.enum(["asc", "desc"])
export type SortDirection = z.infer<typeof SortDirection>

export const FileView = z.enum(["grid", "list"])
export type FileView = z.infer<typeof FileView>

export const ShareType = z.enum(["internal", "external_direct", "external_explorer"])
export type ShareType = z.infer<typeof ShareType>

export const ResourceType = z.enum(["file", "folder"])
export type ResourceType = z.infer<typeof ResourceType>

export const BucketRole = z.enum(["owner", "admin", "manager", "editor", "viewer", "guest"])
export type BucketRole = z.infer<typeof BucketRole>
export const WorkspaceRole = BucketRole
export type WorkspaceRole = BucketRole

export const AuthUserId = z.string().min(1)
export type AuthUserId = z.infer<typeof AuthUserId>
