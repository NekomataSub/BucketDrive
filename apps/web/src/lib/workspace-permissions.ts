import { can, type Permission, type WorkspaceRole } from "@bucketdrive/shared"

export interface WorkspaceCapabilities {
  canUpload: boolean
  canCreateFolder: boolean
  canRenameFile: boolean
  canRenameFolder: boolean
  canMoveFile: boolean
  canMoveFolder: boolean
  canDeleteFile: boolean
  canDeleteFolder: boolean
  canShareFile: boolean
  canShareFolder: boolean
  canFavorite: boolean
  canTag: boolean
  canReadSettings: boolean
  canUpdateSettings: boolean
}

export function normalizeWorkspaceRole(role: unknown): WorkspaceRole {
  const normalized = typeof role === "string" ? role.split(",")[0]?.trim().toLowerCase() : "viewer"
  const roles = ["owner", "admin", "manager", "editor", "viewer", "guest"] as const

  return roles.includes(normalized as WorkspaceRole) ? (normalized as WorkspaceRole) : "viewer"
}

export function hasWorkspacePermission(
  role: WorkspaceRole | null | undefined,
  permission: Permission,
): boolean {
  return can(role ?? "viewer", permission)
}

export function getWorkspaceCapabilities(
  role: WorkspaceRole | null | undefined,
  hasWorkspace: boolean,
): WorkspaceCapabilities {
  const normalizedRole = role ?? "viewer"
  const allowed = (permission: Permission) => hasWorkspace && can(normalizedRole, permission)

  return {
    canUpload: allowed("files.upload"),
    canCreateFolder: allowed("folders.create"),
    canRenameFile: allowed("files.rename"),
    canRenameFolder: allowed("folders.rename"),
    canMoveFile: allowed("files.move"),
    canMoveFolder: allowed("folders.move"),
    canDeleteFile: allowed("files.delete"),
    canDeleteFolder: allowed("folders.delete"),
    canShareFile: allowed("files.share"),
    canShareFolder: allowed("folders.share"),
    canFavorite: allowed("files.favorite"),
    canTag: allowed("files.tag"),
    canReadSettings: allowed("bucket.settings.read"),
    canUpdateSettings: allowed("bucket.settings.update"),
  }
}
