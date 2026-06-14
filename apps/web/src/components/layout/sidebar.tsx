/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-template-expressions */
import { Link } from "@tanstack/react-router"
import { Files, Trash2, Settings, Link2, Shield, ScrollText, Users, Globe } from "lucide-react"
import { FolderTree } from "@/components/features/folder-tree"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import { usePlatformMe, useDashboardOverview } from "@/lib/api"
import { can } from "@bucketdrive/shared"

export function Sidebar() {
  const { workspace, workspaceId, role } = useCurrentWorkspace()
  const { data: me } = usePlatformMe()
  const { data: overview } = useDashboardOverview(workspaceId)

  const navItems = [
    { to: "/dashboard/files", icon: Files, label: "Files", visible: true },
    { to: "/dashboard/shares", icon: Link2, label: "Share Links", visible: true },
    { to: "/dashboard/trash", icon: Trash2, label: "Trash", visible: true },
    {
      to: "/dashboard",
      icon: Shield,
      label: "Admin Overview",
      visible: can(role ?? "viewer", "analytics.read"),
    },
    {
      to: "/dashboard/members",
      icon: Users,
      label: "Members",
      visible: can(role ?? "viewer", "users.read"),
    },
    {
      to: "/dashboard/audit",
      icon: ScrollText,
      label: "Audit",
      visible: can(role ?? "viewer", "audit.read"),
    },
    {
      to: "/dashboard/settings",
      icon: Settings,
      label: "Settings",
      visible: can(role ?? "viewer", "bucket.settings.read"),
    },
    {
      to: "/dashboard/platform",
      icon: Globe,
      label: "Platform",
      visible: me?.isPlatformAdmin ?? false,
    },
  ]

  return (
    <aside className="w-sidebar border-border-muted bg-bg-secondary flex flex-col border-r">
      <div className="flex flex-1 flex-col gap-1 p-3">
        {workspace && (
          <div className="text-text-primary mb-2 px-3 py-1.5 text-sm font-medium">
            {workspace.name}
          </div>
        )}
        {navItems
          .filter((item) => item.visible)
          .map((item) => (
            <Link
              key={item.label}
              to={item.to}
              {...(item.to === "/dashboard/files"
                ? { search: { folderId: undefined, previewFileId: undefined } }
                : {})}
              activeOptions={{ exact: true }}
              className="text-text-secondary hover:bg-surface-hover hover:text-text-primary [&.active]:bg-surface-active [&.active]:text-text-primary flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        <div className="bg-border-muted my-1 h-px" />
        <FolderTree />
      </div>
      <div className="border-border-muted border-t p-3">
        <div className="bg-surface-hover text-text-secondary rounded-lg p-3 text-xs">
          <div className="text-text-primary font-medium">Free Plan</div>
          {overview && (
            <>
              <div className="mt-1">
                {formatBytes(overview.summary.usedStorageBytes)} of{" "}
                {formatBytes(overview.summary.quotaBytes)} used
              </div>
              <div className="bg-border-default mt-1 h-1.5 rounded-full">
                <div
                  className="bg-accent h-full rounded-full"
                  style={{
                    width: `${Math.min(
                      (overview.summary.usedStorageBytes / overview.summary.quotaBytes) * 100,
                      100,
                    )}%`,
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
