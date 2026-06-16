/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-argument */
import { useMemo, useRef, useState } from "react"
import { RotateCcw, Trash2 } from "lucide-react"
import {
  useEmptyTrash,
  useBatchPermanentDelete,
  useBatchRestore,
  usePermanentlyDeleteFile,
  usePermanentlyDeleteFolder,
  useRestoreAllTrash,
  useRestoreFile,
  useRestoreFolder,
  useTrash,
  type TrashItem,
} from "@/lib/api"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useMultiSelect } from "@/hooks/use-multi-select"
import { useSearchStore } from "@/stores/search-store"
import { SelectionMarquee } from "@/components/features/selection-marquee"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ActionButton, PageHeader, PageToolbar } from "@/components/shared/page-layout"
import { StyledSelect } from "@/components/shared/styled-select"
import { formatBytes } from "@/lib/format"
import { can } from "@bucketdrive/shared"
import { useI18n } from "@/lib/i18n"

type TrashSort = "deleted_at" | "name" | "location" | "size"
type TrashConfirmAction =
  | { type: "item"; item: TrashItem }
  | { type: "selected"; count: number; fileIds: string[]; folderIds: string[] }
  | { type: "empty" }

export function TrashPage() {
  const { workspace, workspaceId, isLoading: workspacesLoading } = useCurrentWorkspace()
  const tableRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()

  const trashSortOptions: Array<{ value: TrashSort; label: string }> = [
    { value: "deleted_at", label: t("trash.sort.deletedDate") },
    { value: "name", label: t("trash.sort.name") },
    { value: "location", label: t("trash.sort.location") },
    { value: "size", label: t("trash.sort.size") },
  ]

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
  const batchRestore = useBatchRestore(workspaceId)
  const batchPermanentDelete = useBatchPermanentDelete(workspaceId)
  const restoreAllTrash = useRestoreAllTrash(workspaceId)
  const emptyTrash = useEmptyTrash(workspaceId)

  const items = trashQuery.data?.data ?? []
  const selectionItems = useMemo(
    () => items.map((item) => ({ id: item.id, type: item.resourceType })),
    [items],
  )
  const selection = useMultiSelect({ items: selectionItems, containerRef: tableRef })
  const retentionDays = useMemo(
    () => Math.max(...items.map((item) => item.daysRemaining), 30),
    [items],
  )
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<TrashConfirmAction | null>(null)
  const selectedFileIds = selection.selectedIdsByType("file")
  const selectedFolderIds = selection.selectedIdsByType("folder")
  const selectedCount = selection.selectedCount
  const canPermanentlyDelete = workspace ? can(workspace.role, "trash.permanent_delete") : false
  const isGlobalActionPending = restoreAllTrash.isPending || emptyTrash.isPending
  const globalActionsDisabled = items.length === 0 || trashQuery.isFetching || isGlobalActionPending

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
    setConfirmAction({ type: "item", item })
  }

  const handleRestoreSelected = () => {
    if (selectedCount === 0) return
    batchRestore.mutate(
      { files: selectedFileIds, folders: selectedFolderIds },
      { onSuccess: () => selection.clearSelection() },
    )
  }

  const handlePermanentDeleteSelected = () => {
    if (selectedCount === 0 || !canPermanentlyDelete) return
    setConfirmAction({
      type: "selected",
      count: selectedCount,
      fileIds: selectedFileIds,
      folderIds: selectedFolderIds,
    })
  }

  const handleRestoreAll = () => {
    if (globalActionsDisabled) return
    restoreAllTrash.mutate(undefined, { onSuccess: () => selection.clearSelection() })
  }

  const handleEmptyTrash = () => {
    if (globalActionsDisabled || !canPermanentlyDelete) return
    setConfirmAction({ type: "empty" })
  }

  const handleConfirmPermanentDelete = () => {
    if (!confirmAction) return

    if (confirmAction.type === "item") {
      const { item } = confirmAction
      const key = `${item.resourceType}-${item.id}`
      setBusyItemKey(key)
      if (item.resourceType === "file") {
        deleteFileForever.mutate(
          { fileId: item.id },
          {
            onSuccess: () => setConfirmAction(null),
            onSettled: () => setBusyItemKey(null),
          },
        )
        return
      }

      deleteFolderForever.mutate(
        { folderId: item.id },
        {
          onSuccess: () => setConfirmAction(null),
          onSettled: () => setBusyItemKey(null),
        },
      )
      return
    }

    if (confirmAction.type === "selected") {
      batchPermanentDelete.mutate(
        { files: confirmAction.fileIds, folders: confirmAction.folderIds },
        {
          onSuccess: () => {
            selection.clearSelection()
            setConfirmAction(null)
          },
        },
      )
      return
    }

    emptyTrash.mutate(undefined, {
      onSuccess: () => {
        selection.clearSelection()
        setConfirmAction(null)
      },
    })
  }

  const confirmCopy = (() => {
    if (!confirmAction) return null
    if (confirmAction.type === "item") {
      return {
        title: t("trash.deleteItemTitle"),
        description: t("trash.deleteItemDescription", { name: confirmAction.item.name }),
        confirmLabel: t("trash.deletePermanently"),
        loadingLabel: t("trash.deleting"),
      }
    }
    if (confirmAction.type === "selected") {
      return {
        title: t("trash.deleteSelectedTitle"),
        description: t("trash.deleteSelectedDescription", { count: confirmAction.count }),
        confirmLabel: t("trash.deletePermanently"),
        loadingLabel: t("trash.deleting"),
      }
    }
    return {
      title: t("trash.emptyConfirmTitle"),
      description: t("trash.emptyConfirmDescription"),
      confirmLabel: t("trash.emptyTrash"),
      loadingLabel: t("trash.emptying"),
    }
  })()

  const orderLabel =
    sort === "deleted_at"
      ? order === "desc"
        ? t("sort.newest")
        : t("sort.oldest")
      : order === "desc"
        ? t("sort.desc")
        : t("sort.asc")

  if (workspacesLoading || trashQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="border-accent h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-text-tertiary text-sm">{t("settings.noBucket")}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col p-4 sm:p-6">
      <SelectionMarquee rect={selection.selectionRect} />
      <PageHeader
        title={t("trash.title")}
        description={t("trash.retention", { days: retentionDays })}
      />

      <PageToolbar>
        <StyledSelect
          ariaLabel={t("trash.sort")}
          value={sort}
          onValueChange={setSort}
          options={trashSortOptions}
          triggerClassName="rounded-lg bg-bg-tertiary"
        />

        <ActionButton onClick={() => setOrder((current) => (current === "desc" ? "asc" : "desc"))}>
          {orderLabel}
        </ActionButton>

        <div className="flex-1" />

        <ActionButton
          onClick={handleRestoreAll}
          disabled={globalActionsDisabled}
          loading={restoreAllTrash.isPending}
          loadingLabel={t("trash.restoring")}
          icon={<RotateCcw className="h-4 w-4" />}
        >
          {t("trash.restoreAll")}
        </ActionButton>

        {canPermanentlyDelete && (
          <ActionButton
            variant="danger"
            onClick={handleEmptyTrash}
            disabled={globalActionsDisabled}
            loading={emptyTrash.isPending}
            loadingLabel={t("trash.emptying")}
            icon={<Trash2 className="h-4 w-4" />}
          >
            {t("trash.emptyTrash")}
          </ActionButton>
        )}
      </PageToolbar>

      {selectedCount > 0 && (
        <div className="border-accent bg-accent/10 mb-3 flex flex-col gap-2 rounded-lg border px-4 py-2 sm:flex-row sm:items-center">
          <span className="text-text-primary text-sm font-medium">
            {t("trash.selected", { count: selectedCount })}
          </span>
          <div className="hidden flex-1 sm:block" />
          <button
            type="button"
            onClick={handleRestoreSelected}
            className="text-text-secondary hover:bg-surface-hover hover:text-text-primary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("trash.restoreSelected")}
          </button>
          {canPermanentlyDelete && (
            <button
              type="button"
              onClick={handlePermanentDeleteSelected}
              className="text-error hover:bg-error/10 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("trash.deletePermanently")}
            </button>
          )}
          <button
            type="button"
            onClick={selection.clearSelection}
            className="text-text-tertiary hover:text-text-primary rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            {t("app.cancel")}
          </button>
        </div>
      )}

      {trashQuery.isError && (
        <div className="border-error/40 bg-error/10 text-error mb-4 rounded-lg border px-4 py-3 text-sm">
          {trashQuery.error.message}
        </div>
      )}

      {items.length === 0 ? (
        <div className="border-border-default bg-surface-default flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <Trash2 className="text-text-tertiary h-10 w-10" />
          <p className="text-text-primary text-sm font-medium">{t("trash.emptyTitle")}</p>
          <p className="text-text-tertiary max-w-xl text-xs">{t("trash.emptyDescription")}</p>
        </div>
      ) : (
        <div
          ref={tableRef}
          onPointerDown={selection.handleContainerPointerDown}
          onPointerMove={selection.handleContainerPointerMove}
          onPointerUp={selection.handleContainerPointerUp}
          onPointerCancel={selection.handleContainerPointerCancel}
          className="border-border-default min-h-48 overflow-hidden rounded-xl border md:min-h-[calc(100dvh-420px)]"
        >
          <div className="divide-border-muted divide-y md:hidden">
            {items.map((item, index) => {
              const itemKey = `${item.resourceType}-${item.id}`
              const selected = selection.isSelected({ id: item.id, type: item.resourceType })
              return (
                <div
                  key={itemKey}
                  data-selectable-item
                  data-item-id={item.id}
                  data-item-type={item.resourceType}
                  onClick={(event) =>
                    selection.handleItemClick(
                      { id: item.id, type: item.resourceType },
                      index,
                      event,
                    )
                  }
                  className={`space-y-3 p-4 ${selected ? "bg-accent/10" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg">
                      {item.resourceType === "file" ? "\uD83D\uDCC4" : "\uD83D\uDCC2"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-text-primary truncate text-sm font-medium">{item.name}</p>
                      <p className="text-text-tertiary text-xs capitalize">{item.resourceType}</p>
                      <p className="text-text-secondary mt-2 text-xs">
                        {t("trash.location")}: {item.originalLocation}
                      </p>
                      <p className="text-text-secondary mt-1 text-xs">
                        {t("trash.deleted")} {new Date(item.deletedAt).toLocaleString()}
                      </p>
                      <p className="text-text-secondary mt-1 text-xs">
                        {t("trash.daysRemaining", { days: item.daysRemaining })}
                      </p>
                      {item.resourceType === "file" && (
                        <p className="text-text-secondary mt-1 text-xs">
                          {t("trash.size")}: {formatBytes(item.sizeBytes)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row" data-selection-ignore>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        handleRestore(item)
                      }}
                      disabled={busyItemKey === itemKey}
                      className="border-border-muted text-text-secondary hover:bg-surface-default hover:text-text-primary inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {busyItemKey === itemKey ? t("trash.restoring") : t("trash.restore")}
                    </button>
                    {canPermanentlyDelete && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          handlePermanentDelete(item)
                        }}
                        disabled={busyItemKey === itemKey}
                        className="border-error/40 text-error hover:bg-error/10 inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {busyItemKey === itemKey
                          ? t("trash.deleting")
                          : t("trash.deletePermanently")}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <table className="hidden w-full md:table">
            <thead data-selection-ignore>
              <tr className="border-border-muted bg-surface-default border-b">
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                  {t("trash.item")}
                </th>
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                  {t("trash.location")}
                </th>
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                  {t("trash.deleted")}
                </th>
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                  {t("trash.remaining")}
                </th>
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                  {t("trash.size")}
                </th>
                <th className="text-text-tertiary w-56 px-4 py-3 text-right text-xs font-medium">
                  {t("trash.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr
                  key={`${item.resourceType}-${item.id}`}
                  data-selectable-item
                  data-item-id={item.id}
                  data-item-type={item.resourceType}
                  onClick={(event) =>
                    selection.handleItemClick(
                      { id: item.id, type: item.resourceType },
                      index,
                      event,
                    )
                  }
                  className={`border-border-muted hover:bg-surface-hover border-b transition-colors last:border-b-0 ${
                    selection.isSelected({ id: item.id, type: item.resourceType })
                      ? "bg-accent/10"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        {item.resourceType === "file" ? "\uD83D\uDCC4" : "\uD83D\uDCC2"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-text-primary truncate text-sm font-medium">
                          {item.name}
                        </p>
                        <p className="text-text-tertiary text-xs capitalize">{item.resourceType}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-text-secondary px-4 py-3 text-sm">{item.originalLocation}</td>
                  <td className="text-text-secondary px-4 py-3 text-sm">
                    {new Date(item.deletedAt).toLocaleString()}
                  </td>
                  <td className="text-text-secondary px-4 py-3 text-sm">
                    {t("trash.days", { days: item.daysRemaining })}
                  </td>
                  <td className="text-text-secondary px-4 py-3 text-sm">
                    {item.resourceType === "file" ? formatBytes(item.sizeBytes) : "--"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2" data-selection-ignore>
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          handleRestore(item)
                        }}
                        disabled={busyItemKey === `${item.resourceType}-${item.id}`}
                        className="border-border-muted text-text-secondary hover:bg-surface-default hover:text-text-primary inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {busyItemKey === `${item.resourceType}-${item.id}`
                          ? "Restoring..."
                          : t("trash.restore")}
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          handlePermanentDelete(item)
                        }}
                        disabled={busyItemKey === `${item.resourceType}-${item.id}`}
                        className="border-error/40 text-error hover:bg-error/10 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {busyItemKey === `${item.resourceType}-${item.id}`
                          ? t("trash.deleting")
                          : t("trash.deletePermanently")}
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
        deleteFolderForever.isError ||
        restoreAllTrash.isError ||
        emptyTrash.isError) && (
        <div className="border-error/40 bg-error/10 text-error mt-4 rounded-lg border px-4 py-3 text-sm">
          {restoreFile.error?.message ??
            restoreFolder.error?.message ??
            deleteFileForever.error?.message ??
            deleteFolderForever.error?.message ??
            restoreAllTrash.error?.message ??
            emptyTrash.error?.message}
        </div>
      )}

      {confirmCopy && (
        <ConfirmDialog
          open={confirmAction !== null}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          loadingLabel={confirmCopy.loadingLabel}
          loading={
            deleteFileForever.isPending ||
            deleteFolderForever.isPending ||
            batchPermanentDelete.isPending ||
            emptyTrash.isPending
          }
          onConfirm={handleConfirmPermanentDelete}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null)
          }}
        />
      )}
    </div>
  )
}
