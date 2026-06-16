/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Link } from "@tanstack/react-router"
import { Files, Trash2, Settings, Link2, Shield, ScrollText, Users, Globe } from "lucide-react"
import { FolderTree } from "@/components/features/folder-tree"
import { ProgressBar } from "@/components/shared/progress-bar"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import { formatBytes } from "@/lib/format"
import { usePlatformMe, useDashboardOverview } from "@/lib/api"
import { can } from "@bucketdrive/shared"
import { useI18n } from "@/lib/i18n"

interface SidebarProps {
  mobileOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const { workspace, workspaceId, role } = useCurrentWorkspace()
  const { data: me } = usePlatformMe()
  const { data: overview } = useDashboardOverview(workspaceId)
  const { t } = useI18n()

  const navItems = [
    { to: "/dashboard/files", icon: Files, label: t("nav.files"), visible: true },
    { to: "/dashboard/shares", icon: Link2, label: t("nav.shareLinks"), visible: true },
    { to: "/dashboard/trash", icon: Trash2, label: t("nav.trash"), visible: true },
    {
      to: "/dashboard",
      icon: Shield,
      label: t("nav.adminOverview"),
      visible: can(role ?? "viewer", "analytics.read"),
    },
    {
      to: "/dashboard/members",
      icon: Users,
      label: t("nav.members"),
      visible: can(role ?? "viewer", "users.read"),
    },
    {
      to: "/dashboard/audit",
      icon: ScrollText,
      label: t("nav.audit"),
      visible: can(role ?? "viewer", "audit.read"),
    },
    {
      to: "/dashboard/settings",
      icon: Settings,
      label: t("nav.settings"),
      visible: can(role ?? "viewer", "bucket.settings.read"),
    },
    {
      to: "/dashboard/platform",
      icon: Globe,
      label: t("nav.platform"),
      visible: me?.isPlatformAdmin ?? false,
    },
  ]

  const renderContent = () => (
    <>
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
              onClick={onClose}
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
          <div className="text-text-primary font-medium">{t("plan.free")}</div>
          {overview && (
            <>
              <div className="mt-1">
                {t("plan.storageUsed", {
                  used: formatBytes(overview.summary.usedStorageBytes),
                  quota: formatBytes(overview.summary.quotaBytes),
                })}
              </div>
              <ProgressBar
                className="bg-border-default mt-1"
                value={(overview.summary.usedStorageBytes / overview.summary.quotaBytes) * 100}
              />
            </>
          )}
        </div>
      </div>
    </>
  )

  return (
    <>
      <aside className="w-sidebar border-border-muted bg-bg-secondary hidden shrink-0 flex-col border-r lg:flex">
        {renderContent()}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label={t("nav.closeNavigation")}
            onClick={onClose}
          />
          <aside className="bg-bg-secondary border-border-muted relative flex h-full w-[min(320px,calc(100vw-3rem))] flex-col border-r shadow-xl">
            {renderContent()}
          </aside>
        </div>
      )}
    </>
  )
}
