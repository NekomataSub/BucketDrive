import type { WorkspaceRole } from "../schemas/common"

export const ROLE_RANK: Record<WorkspaceRole, number> = {
  guest: 0,
  viewer: 1,
  editor: 2,
  manager: 3,
  admin: 4,
  owner: 5,
}

export function isWorkspaceRole(value: string | null | undefined): value is WorkspaceRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "manager" ||
    value === "editor" ||
    value === "viewer" ||
    value === "guest"
  )
}

export function normalizeWorkspaceRole(value: string | null | undefined): WorkspaceRole {
  const normalized = value?.split(",")[0]?.trim().toLowerCase()
  return isWorkspaceRole(normalized) ? normalized : "viewer"
}

export function compareWorkspaceRoles(left: WorkspaceRole, right: WorkspaceRole): number {
  return ROLE_RANK[left] - ROLE_RANK[right]
}

export function canManageWorkspaceRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
): boolean {
  if (targetRole === "owner") return false
  return compareWorkspaceRoles(actorRole, targetRole) > 0
}

export function canAssignWorkspaceRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
): boolean {
  if (targetRole === "owner") return false
  return compareWorkspaceRoles(actorRole, targetRole) >= 0
}
