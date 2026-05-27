import {
  FolderOpen,
  Share2,
  Trash2,
  Users,
  Settings,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react"
import type { Command, CommandCategory } from "./types"
import { can, type WorkspaceRole } from "@bucketdrive/shared"

interface NavigationCommandDef {
  id: string
  title: string
  subtitle?: string
  icon: LucideIcon
  to: string
  category: CommandCategory
  keywords?: string[]
  adminOnly?: boolean
}

const navigationDefs: NavigationCommandDef[] = [
  {
    id: "nav-files",
    title: "Go to Files",
    subtitle: "Open the file explorer",
    icon: FolderOpen,
    to: "/dashboard/files",
    category: "navigation",
    keywords: ["files", "explorer", "documents"],
  },
  {
    id: "nav-shared",
    title: "Go to Shared with Me",
    subtitle: "View files shared with you",
    icon: Share2,
    to: "/shared",
    category: "navigation",
    keywords: ["shared", "shares", "received"],
  },
  {
    id: "nav-shares",
    title: "Go to Share Links",
    subtitle: "Manage your share links",
    icon: Share2,
    to: "/dashboard/shares",
    category: "navigation",
    keywords: ["shares", "links", "public"],
  },
  {
    id: "nav-trash",
    title: "Go to Trash",
    subtitle: "View deleted items",
    icon: Trash2,
    to: "/dashboard/trash",
    category: "navigation",
    keywords: ["trash", "deleted", "recycle", "bin"],
  },
  {
    id: "nav-members",
    title: "Go to Members",
    subtitle: "Manage workspace members",
    icon: Users,
    to: "/dashboard/members",
    category: "navigation",
    keywords: ["members", "users", "team", "people"],
    adminOnly: true,
  },
  {
    id: "nav-settings",
    title: "Go to Settings",
    subtitle: "Workspace settings",
    icon: Settings,
    to: "/dashboard/settings",
    category: "navigation",
    keywords: ["settings", "config", "preferences"],
    adminOnly: true,
  },
  {
    id: "nav-dashboard",
    title: "Go to Dashboard",
    subtitle: "Admin overview",
    icon: LayoutDashboard,
    to: "/dashboard",
    category: "navigation",
    keywords: ["dashboard", "overview", "analytics", "home"],
    adminOnly: true,
  },
]

function isAdminRole(role: string | undefined): boolean {
  return can((role ?? "viewer") as WorkspaceRole, "analytics.read")
}

export function getNavigationCommands(
  navigate: (opts: { to: string }) => void,
  userRole?: string,
): Command[] {
  return navigationDefs
    .filter((def) => {
      if (!def.adminOnly) return true
      return isAdminRole(userRole)
    })
    .map((def) => ({
      id: def.id,
      title: def.title,
      subtitle: def.subtitle,
      icon: def.icon,
      category: def.category,
      keywords: def.keywords,
      action: () => {
        navigate({ to: def.to })
      },
    }))
}
