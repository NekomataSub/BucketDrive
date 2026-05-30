/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-argument */
import { useMemo, useState } from "react"
import { RotateCcw, Trash2 } from "lucide-react"
import {
  usePermanentlyDeleteFile,
  usePermanentlyDeleteFolder,
  useRestoreFile,
  useRestoreFolder,
  useTrash,
    type TrashItem,
 } from "@/lib/api"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useSearchStore } from "@/stores/search-store"

type TrashSort = "deleted_at" | "name" | "location" | "size"

export function TrashPage() {
  const { workspace, workspaceId, isLoading: workspacesLoading } = useCurrentWorkspace()

  const [sort, setSort] = useState<TrashSort>("deleted_at")
  const [order, setOrder] = useState<"asc" | "desc">("desc")
  const query = useSearchStore((state) => state.trash.query)
  const debouncedQuery = useDebouncedValue(query.trim(), 300)

  const trashQuery = useTrash(workspaceId, {
    q: debouncedQuery || undefined,
    sort,
    order,
    page: 1,
    limit: 100,
  })

  const restoreFile = useRestoreFile(workspaceId)
  const restoreFolder = useRestoreFolder(workspaceId)
  const deleteFileForever = usePermanentlyDeleteFile(workspaceId)
  const deleteFolderForever = usePermanentlyDeleteFolder(workspaceId)

  const items = trashQuery.data?.data ?? []
  const retentionDays = useMemo(
    () => Math.max(...items.map((item) => item.daysRemaining), 30),
    [items],
  )
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null)

  const handleRestore = (item: TrashItem) => {
    const key = `${item.resourceType}-${item.id}`
    setBusyItemKey(key)
    if (item.resourceType === "file") {
      restoreFile.mutate({ fileId: item.id }, { onSettled: () => setBusyItemKey(null) })
      return
    }

    restoreFolder.mutate({ folderId: item.id }, { onSettled: () => setBusyItemKey(null) })
  }

  const handlePermanentDelete = (item: TrashItem) => {
    const confirmed = window.confirm(
      `"${item.name}" will be permanently deleted. This cannot be undone.`,
    )
    if (!confirmed) return

    const key = `${item.resourceType}-${item.id}`
    setBusyItemKey(key)
    if (item.resourceType === "file") {
      deleteFileForever.mutate({ fileId: item.id }, { onSettled: () => setBusyItemKey(null) })
      return
    }

    deleteFolderForever.mutate({ folderId: item.id }, { onSettled: () => setBusyItemKey(null) })
  }

  const orderLabel =
    sort === "deleted_at"
      ? order === "desc"
        ? "Newest first"
        : "Oldest first"
      : order === "desc"
        ? "Descending"
        : "Ascending"

  if (workspacesLoading || trashQuery.isLoading) {
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

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Trash</h1>
          <p className="text-xs text-text-tertiary">
            Items are kept for {retentionDays} days, then auto-purged.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as TrashSort)}
            className="rounded-lg border border-border-default bg-surface-default px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="deleted_at">Deleted date</option>
            <option value="name">Name</option>
            <option value="location">Original location</option>
            <option value="size">Size</option>
          </select>

          <button
            onClick={() => setOrder((current) => (current === "desc" ? "asc" : "desc"))}
            className="rounded-lg border border-border-default bg-surface-default px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            {orderLabel}
          </button>
        </div>
      </div>

      {trashQuery.isError && (
        <div className="mb-4 rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          {trashQuery.error.message}
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-default bg-surface-default p-10 text-center">
          <Trash2 className="h-10 w-10 text-text-tertiary" />
          <p className="text-sm font-medium text-text-primary">
            Trash is empty - deleted files will appear here for 30 days
          </p>
          <p className="max-w-xl text-xs text-text-tertiary">
            Delete something from the explorer to verify restore and permanent purge flows.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-default">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-muted bg-surface-default">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Item</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Deleted</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Remaining</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Size</th>
                <th className="w-56 px-4 py-3 text-right text-xs font-medium text-text-tertiary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={`${item.resourceType}-${item.id}`}
                  className="border-b border-border-muted transition-colors last:border-b-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        {item.resourceType === "file" ? "\uD83D\uDCC4" : "\uD83D\uDCC2"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{item.name}</p>
                        <p className="text-xs capitalize text-text-tertiary">{item.resourceType}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{item.originalLocation}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {new Date(item.deletedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {item.daysRemaining} day{item.daysRemaining === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {item.resourceType === "file" ? formatBytes(item.sizeBytes) : "--"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleRestore(item)}
                        disabled={busyItemKey === `${item.resourceType}-${item.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-default hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {busyItemKey === `${item.resourceType}-${item.id}` ? "Restoring..." : "Restore"}
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(item)}
                        disabled={busyItemKey === `${item.resourceType}-${item.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-error/40 px-2.5 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {busyItemKey === `${item.resourceType}-${item.id}` ? "Deleting..." : "Delete permanently"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(restoreFile.isError ||
        restoreFolder.isError ||
        deleteFileForever.isError ||
        deleteFolderForever.isError) && (
        <div className="mt-4 rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          {restoreFile.error?.message ??
            restoreFolder.error?.message ??
            deleteFileForever.error?.message ??
            deleteFolderForever.error?.message}
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
