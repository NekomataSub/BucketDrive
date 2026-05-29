/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Share2, Download } from "lucide-react"
import { useWorkspaces, useShares, useDownloadUrl  } from "@/lib/api"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useSearchStore } from "@/stores/search-store"
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!workspaceId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-text-tertiary">No workspace found</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-text-primary">Shared with me</h1>
        <p className="text-xs text-text-tertiary">
          Files and folders shared by other workspace members
        </p>
      </div>

      {shares.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <Share2 className="h-12 w-12 text-text-tertiary" />
          <p className="text-sm text-text-tertiary">Nothing shared with you yet</p>
          <p className="text-xs text-text-tertiary">
            When someone shares a file or folder, it will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-default">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-muted bg-surface-default">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-tertiary">Name</th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-text-tertiary sm:table-cell">
                  Type
                </th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-text-tertiary md:table-cell">
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
    <tr className="border-b border-border-muted transition-colors last:border-b-0 hover:bg-surface-hover">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-lg">
            {share.resourceType === "folder" ? "\uD83D\uDCC2" : "\uD83D\uDCC4"}
          </span>
          <div>
            <p className="truncate text-sm font-medium text-text-primary">
              {share.resourceName}
            </p>
            <p className="text-xs text-text-tertiary">Shared by {share.createdByName}</p>
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-2.5 sm:table-cell">
        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary capitalize">
          {share.resourceType}
        </span>
      </td>
      <td className="hidden px-4 py-2.5 text-sm text-text-tertiary md:table-cell">
        {new Date(share.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1">
          {downloadData?.signedUrl && (
            <a
              href={downloadData.signedUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1.5 text-text-tertiary transition-colors hover:bg-surface-default hover:text-text-primary"
              aria-label="Download"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          {isExpired && (
            <span className="rounded-full bg-error/10 px-2 py-0.5 text-xs text-error">
              Expired
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}
