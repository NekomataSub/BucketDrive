/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Share2, Download } from "lucide-react"
import { useWorkspaces, useShares, useDownloadUrl } from "@/lib/api"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useSearchStore } from "@/stores/search-store"
import { PageHeader } from "@/components/shared/page-layout"
import type { ShareDashboardItem } from "@bucketdrive/shared"

export function SharedPage() {
  const { data: workspacesData, isLoading: wsLoading } = useWorkspaces()
  const workspaceId = workspacesData?.data?.[0]?.id ?? null
  const query = useSearchStore((state) => state.shared.query)
  const debouncedQuery = useDebouncedValue(query.trim(), 300)

  const { data: sharesData, isLoading: sharesLoading } = useShares(workspaceId, {
    scope: "shared_with_me",
    q: debouncedQuery || undefined,
  })

  const shares = sharesData?.data ?? []
  const isLoading = wsLoading || sharesLoading

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="border-accent h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  if (!workspaceId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-text-tertiary text-sm">No bucket found</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-6">
      <PageHeader
        title="Shared with me"
        description="Files and folders shared by other bucket members"
      />

      {shares.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <Share2 className="text-text-tertiary h-12 w-12" />
          <p className="text-text-tertiary text-sm">Nothing shared with you yet</p>
          <p className="text-text-tertiary text-xs">
            When someone shares a file or folder, it will appear here.
          </p>
        </div>
      ) : (
        <div className="border-border-default overflow-hidden rounded-xl border">
          <table className="w-full">
            <thead>
              <tr className="border-border-muted bg-surface-default border-b">
                <th className="text-text-tertiary px-4 py-2.5 text-left text-xs font-medium">
                  Name
                </th>
                <th className="text-text-tertiary hidden px-4 py-2.5 text-left text-xs font-medium sm:table-cell">
                  Type
                </th>
                <th className="text-text-tertiary hidden px-4 py-2.5 text-left text-xs font-medium md:table-cell">
                  Shared
                </th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {shares.map((share) => (
                <SharedRow key={share.id} share={share} workspaceId={workspaceId} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SharedRow({ share, workspaceId }: { share: ShareDashboardItem; workspaceId: string }) {
  const { data: downloadData } = useDownloadUrl(
    share.resourceType === "file" ? workspaceId : null,
    share.resourceType === "file" ? share.resourceId : null,
  )

  const isExpired = share.expiresAt ? new Date(share.expiresAt) < new Date() : false

  return (
    <tr className="border-border-muted hover:bg-surface-hover border-b transition-colors last:border-b-0">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-lg">
            {share.resourceType === "folder" ? "\uD83D\uDCC2" : "\uD83D\uDCC4"}
          </span>
          <div>
            <p className="text-text-primary truncate text-sm font-medium">{share.resourceName}</p>
            <p className="text-text-tertiary text-xs">Shared by {share.createdByName}</p>
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-2.5 sm:table-cell">
        <span className="bg-surface-hover text-text-secondary rounded-full px-2 py-0.5 text-xs capitalize">
          {share.resourceType}
        </span>
      </td>
      <td className="text-text-tertiary hidden px-4 py-2.5 text-sm md:table-cell">
        {new Date(share.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1">
          {downloadData?.signedUrl && (
            <a
              href={downloadData.signedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-text-tertiary hover:bg-surface-default hover:text-text-primary rounded p-1.5 transition-colors"
              aria-label="Download"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          {isExpired && (
            <span className="bg-error/10 text-error rounded-full px-2 py-0.5 text-xs">Expired</span>
          )}
        </div>
      </td>
    </tr>
  )
}
