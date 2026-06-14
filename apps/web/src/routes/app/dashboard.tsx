/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-template-expressions */
import { useEffect } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { BarChart3, Files, FolderTree, HardDrive, Link2, Users } from "lucide-react"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import { useDashboardOverview } from "@/lib/api"
import { PageHeader } from "@/components/shared/page-layout"
import { can } from "@bucketdrive/shared"

const numberFormatter = new Intl.NumberFormat("en-US")

export function DashboardPage() {
  const { workspace, workspaceId, role, isLoading: workspacesLoading } = useCurrentWorkspace()
  const isAdmin = can(role ?? "viewer", "analytics.read")
  const navigate = useNavigate()

  const overviewQuery = useDashboardOverview(workspaceId)

  useEffect(() => {
    if (!workspacesLoading && workspace && !isAdmin) {
      window.location.replace("/dashboard/files")
    }
  }, [isAdmin, workspace, workspacesLoading])

  if (workspacesLoading || (workspaceId !== null && overviewQuery.isLoading)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="border-accent h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-text-tertiary text-sm">No bucket found</p>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  if (overviewQuery.isError) {
    return (
      <div className="p-4 sm:p-6">
        <div className="border-error/40 bg-error/10 text-error rounded-xl border px-4 py-3 text-sm">
          {overviewQuery.error.message}
        </div>
      </div>
    )
  }

  const overview = overviewQuery.data
  if (!overview) {
    return null
  }

  const handleLargestFileClick = (folderId: string | null) => {
    void navigate({
      to: "/dashboard/files",
      search: { folderId: folderId ?? undefined, previewFileId: undefined },
    })
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Admin Overview"
        title={workspace.name}
        description="Monitor storage, shares, member growth, and recent activity from one place."
      />

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
        <div className="border-border-default bg-surface-default rounded-2xl border p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-text-primary text-base font-semibold">Storage Trend</h2>
              <p className="text-text-tertiary text-xs">Cumulative usage over the last 7 days</p>
            </div>
            <span className="text-text-secondary text-xs">
              {formatPercent(overview.summary.usedStorageBytes, overview.summary.quotaBytes)} of
              quota
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
                  <div className="bg-bg-tertiary relative flex-1 overflow-hidden rounded-xl">
                    <div
                      className={`bg-accent absolute inset-x-0 bottom-0 rounded-xl ${getBarHeightClass(ratio)}`}
                    />
                  </div>
                  <div>
                    <p className="text-text-primary text-[11px] font-medium">
                      {formatShortDate(point.date)}
                    </p>
                    <p className="text-text-tertiary text-[11px]">{formatBytes(point.usedBytes)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="border-border-default bg-surface-default rounded-2xl border p-5">
          <h2 className="text-text-primary text-base font-semibold">Largest Files</h2>
          <p className="text-text-tertiary mt-1 text-xs">Top 5 non-deleted files by size</p>
          <div className="mt-5 space-y-3">
            {overview.largestFiles.length === 0 ? (
              <p className="border-border-default bg-bg-tertiary text-text-tertiary rounded-xl border border-dashed px-4 py-6 text-sm">
                No file data yet.
              </p>
            ) : (
              overview.largestFiles.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  className="border-border-muted bg-bg-tertiary hover:border-accent/60 focus-visible:ring-accent w-full rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2"
                  onClick={() => {
                    handleLargestFileClick(file.folderId)
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-text-primary truncate text-sm font-medium">{file.name}</p>
                      <p className="text-text-tertiary mt-1 text-xs">{file.mimeType}</p>
                    </div>
                    <span className="text-text-secondary shrink-0 text-xs font-medium">
                      {formatBytes(file.sizeBytes)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="border-border-default bg-surface-default rounded-2xl border p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-text-primary text-base font-semibold">Recent Activity</h2>
              <p className="text-text-tertiary text-xs">Latest 10 audit events</p>
            </div>
            <Link
              to="/dashboard/audit"
              className="text-accent text-xs font-medium transition-opacity hover:opacity-80"
            >
              View all
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {overview.recentActivity.length === 0 ? (
              <p className="border-border-default bg-bg-tertiary text-text-tertiary rounded-xl border border-dashed px-4 py-6 text-sm">
                No audit activity yet.
              </p>
            ) : (
              overview.recentActivity.map((item) => (
                <div
                  key={item.id}
                  className="border-border-muted bg-bg-tertiary flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <p className="text-text-primary text-sm font-medium">{item.action}</p>
                    <p className="text-text-tertiary mt-1 text-xs">
                      {(item.actorName ?? item.actorId) || "Unknown actor"} • {item.resourceType}
                    </p>
                  </div>
                  <span className="text-text-secondary shrink-0 text-xs">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
              ))
            )}
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
    <div className="border-border-default bg-surface-default rounded-2xl border p-5">
      <div className={`inline-flex rounded-xl p-2 ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-text-tertiary mt-4 text-sm">{label}</p>
      <p className="text-text-primary mt-2 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
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
