/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-template-expressions */
import { useEffect } from "react"
import { Link } from "@tanstack/react-router"
import { BarChart3, Files, FolderTree, HardDrive, Link2, Users } from "lucide-react"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import { useDashboardOverview  } from "@/lib/api"
import { can } from "@bucketdrive/shared"

const numberFormatter = new Intl.NumberFormat("en-US")

export function DashboardPage() {
  const { workspace, workspaceId, role, isLoading: workspacesLoading } = useCurrentWorkspace()
  const isAdmin = can(role ?? "viewer", "analytics.read")

  const overviewQuery = useDashboardOverview(workspaceId)

  useEffect(() => {
    if (!workspacesLoading && workspace && !isAdmin) {
      window.location.replace("/dashboard/files")
    }
  }, [isAdmin, workspace, workspacesLoading])

  if (workspacesLoading || (workspaceId !== null && overviewQuery.isLoading)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-text-tertiary">No workspace found</p>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  if (overviewQuery.isError) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          {overviewQuery.error.message}
        </div>
      </div>
    )
  }

  const overview = overviewQuery.data
  if (!overview) {
    return null
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-tertiary">
            Admin Overview
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
            {workspace.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Monitor storage, shares, member growth, and recent activity from one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickLink to="/dashboard/files" icon={Files} label="Open Files" />
          <QuickLink to="/dashboard/members" icon={Users} label="Manage Members" />
          <QuickLink to="/dashboard/settings" icon={HardDrive} label="Workspace Settings" />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard
          icon={Files}
          label="Files"
          value={numberFormatter.format(overview.summary.totalFiles)}
          accent="bg-sky-500/10 text-sky-300"
        />
        <StatCard
          icon={FolderTree}
          label="Folders"
          value={numberFormatter.format(overview.summary.totalFolders)}
          accent="bg-emerald-500/10 text-emerald-300"
        />
        <StatCard
          icon={Users}
          label="Members"
          value={numberFormatter.format(overview.summary.memberCount)}
          accent="bg-amber-500/10 text-amber-300"
        />
        <StatCard
          icon={Link2}
          label="Active Shares"
          value={numberFormatter.format(overview.summary.activeShares)}
          accent="bg-rose-500/10 text-rose-300"
        />
        <StatCard
          icon={HardDrive}
          label="Used Storage"
          value={formatBytes(overview.summary.usedStorageBytes)}
          accent="bg-indigo-500/10 text-indigo-300"
        />
        <StatCard
          icon={BarChart3}
          label="Quota"
          value={formatBytes(overview.summary.quotaBytes)}
          accent="bg-fuchsia-500/10 text-fuchsia-300"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-border-default bg-surface-default p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Storage Trend</h2>
              <p className="text-xs text-text-tertiary">Cumulative usage over the last 7 days</p>
            </div>
            <span className="text-xs text-text-secondary">
              {formatPercent(
                overview.summary.usedStorageBytes,
                overview.summary.quotaBytes,
              )}{" "}
              of quota
            </span>
          </div>

          <div className="mt-6 grid h-56 grid-cols-7 items-end gap-3">
            {overview.storageTrend.map((point) => {
              const ratio =
                overview.summary.quotaBytes > 0
                  ? Math.max(point.usedBytes / overview.summary.quotaBytes, 0.04)
                  : 0.04

              return (
                <div key={point.date} className="flex h-full flex-col justify-end gap-2">
                  <div className="relative flex-1 overflow-hidden rounded-xl bg-bg-tertiary">
                    <div
                      className={`absolute inset-x-0 bottom-0 rounded-xl bg-accent ${getBarHeightClass(ratio)}`}
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-text-primary">
                      {formatShortDate(point.date)}
                    </p>
                    <p className="text-[11px] text-text-tertiary">{formatBytes(point.usedBytes)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border-default bg-surface-default p-5">
          <h2 className="text-base font-semibold text-text-primary">Largest Files</h2>
          <p className="mt-1 text-xs text-text-tertiary">Top 5 non-deleted files by size</p>
          <div className="mt-5 space-y-3">
            {overview.largestFiles.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-default bg-bg-tertiary px-4 py-6 text-sm text-text-tertiary">
                No file data yet.
              </p>
            ) : (
              overview.largestFiles.map((file) => (
                <div
                  key={file.id}
                  className="rounded-xl border border-border-muted bg-bg-tertiary px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {file.name}
                      </p>
                      <p className="mt-1 text-xs text-text-tertiary">{file.mimeType}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-text-secondary">
                      {formatBytes(file.sizeBytes)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="rounded-2xl border border-border-default bg-surface-default p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Recent Activity</h2>
              <p className="text-xs text-text-tertiary">Latest 10 audit events</p>
            </div>
            <Link
              to="/dashboard/audit"
              className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
            >
              View all
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {overview.recentActivity.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-default bg-bg-tertiary px-4 py-6 text-sm text-text-tertiary">
                No audit activity yet.
              </p>
            ) : (
              overview.recentActivity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border-muted bg-bg-tertiary px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">{item.action}</p>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {(item.actorName ?? item.actorId) || "Unknown actor"} • {item.resourceType}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-text-secondary">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border-default bg-surface-default p-5">
          <h2 className="text-base font-semibold text-text-primary">Admin Shortcuts</h2>
          <p className="mt-1 text-xs text-text-tertiary">
            Jump into the most common operations for workspace administration.
          </p>
          <div className="mt-5 grid gap-3">
            <ShortcutCard
              to="/dashboard/members"
              title="Members"
              description="Invite teammates, update roles, and remove access."
            />
            <ShortcutCard
              to="/dashboard/audit"
              title="Audit Log"
              description="Inspect activity by actor, action, and resource type."
            />
            <ShortcutCard
              to="/dashboard/settings"
              title="Settings"
              description="Adjust quota, file limits, retention, branding, and MIME policy."
            />
          </div>
        </div>
      </section>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Files
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="rounded-2xl border border-border-default bg-surface-default p-5">
      <div className={`inline-flex rounded-xl p-2 ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm text-text-tertiary">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">{value}</p>
    </div>
  )
}

function QuickLink({
  to,
  icon: Icon,
  label,
}: {
  to: string
  icon: typeof Files
  label: string
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-xl border border-border-default bg-surface-default px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}

function ShortcutCard({
  to,
  title,
  description,
}: {
  to: string
  title: string
  description: string
}) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-border-muted bg-bg-tertiary px-4 py-4 transition-colors hover:bg-surface-hover"
    >
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="mt-1 text-xs text-text-tertiary">{description}</p>
    </Link>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatPercent(value: number, total: number) {
  if (total <= 0) return "0%"
  return `${Math.round((value / total) * 100)}%`
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function getBarHeightClass(ratio: number) {
  if (ratio >= 0.95) return "h-full"
  if (ratio >= 0.85) return "h-11/12"
  if (ratio >= 0.75) return "h-10/12"
  if (ratio >= 0.65) return "h-8/12"
  if (ratio >= 0.55) return "h-7/12"
  if (ratio >= 0.45) return "h-6/12"
  if (ratio >= 0.35) return "h-5/12"
  if (ratio >= 0.25) return "h-4/12"
  if (ratio >= 0.15) return "h-3/12"
  if (ratio >= 0.08) return "h-2/12"
  return "h-1/12"
}
