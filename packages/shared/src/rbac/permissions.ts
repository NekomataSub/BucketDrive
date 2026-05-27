import { z } from "zod"
import type { WorkspaceRole } from "../schemas/common"

export const Permission = z.enum([
  "files.read",
  "files.upload",
  "files.rename",
  "files.move",
  "files.copy",
  "files.delete",
  "files.restore",
  "files.favorite",
  "files.tag",
  "files.share",
  "folders.read",
  "folders.create",
  "folders.rename",
  "folders.move",
  "folders.delete",
  "folders.restore",
  "folders.share",
  "trash.permanent_delete",
  "shares.read",
  "shares.create",
  "shares.update",
  "shares.revoke",
  "shares.manage_all",
  "users.invite",
  "users.remove",
  "users.update_roles",
  "users.read",
  "billing.read",
  "billing.manage",
  "analytics.read",
  "audit.read",
  "audit.export",
  "workspace.settings.read",
  "workspace.settings.update",
  "workspace.delete",
  "workspace.transfer",
])

export type Permission = z.infer<typeof Permission>

export const ALL_PERMISSIONS: readonly Permission[] = Permission.options

const SHARED_PERMISSIONS: readonly Permission[] = [
  "shares.read",
  "shares.create",
  "shares.update",
  "shares.revoke",
]

const SHARE_ADMIN_PERMISSIONS: readonly Permission[] = [
  ...SHARED_PERMISSIONS,
  "shares.manage_all",
]

const EDITOR_FILE_PERMISSIONS: readonly Permission[] = [
  "files.read",
  "files.upload",
  "files.rename",
  "files.move",
  "files.copy",
  "files.favorite",
  "files.tag",
  "files.share",
]

const EDITOR_FOLDER_PERMISSIONS: readonly Permission[] = [
  "folders.read",
  "folders.create",
  "folders.rename",
  "folders.move",
  "folders.share",
]

const VIEWER_PERMISSIONS: readonly Permission[] = [
  "files.read",
  "folders.read",
  "shares.read",
]

const MANAGER_PERMISSIONS: readonly Permission[] = [
  ...EDITOR_FILE_PERMISSIONS,
  ...EDITOR_FOLDER_PERMISSIONS,
  ...SHARE_ADMIN_PERMISSIONS,
  "files.delete",
  "files.restore",
  "folders.delete",
  "folders.restore",
  "analytics.read",
  "users.read",
  "workspace.settings.read",
  "audit.read",
  "audit.export",
]

const GUEST_PERMISSIONS: readonly Permission[] = [
  "files.read",
  "folders.read",
]

export const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  owner: [...ALL_PERMISSIONS],
  admin: ALL_PERMISSIONS.filter(
    (p) => p !== "workspace.delete" && p !== "workspace.transfer",
  ),
  manager: [...MANAGER_PERMISSIONS],
  editor: [
    ...EDITOR_FILE_PERMISSIONS,
    ...EDITOR_FOLDER_PERMISSIONS,
    ...SHARED_PERMISSIONS,
  ],
  viewer: [...VIEWER_PERMISSIONS],
  guest: [...GUEST_PERMISSIONS],
}
