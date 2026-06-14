import * as Dialog from "@radix-ui/react-dialog"
import { useEffect, useMemo, useState } from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  X,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import type { Folder as FolderType } from "@bucketdrive/shared"

interface MoveItemsDialogProps {
  open: boolean
  workspaceId: string | null
  title: string
  description?: string
  initialFolderId?: string | null
  excludedFolderIds?: string[]
  loading?: boolean
  createLoading?: boolean
  error?: string
  createError?: string
  onConfirm: (targetFolderId: string | null) => void
  onCreateFolder: (
    name: string,
    parentFolderId: string | null,
  ) => Promise<{ id: string; name: string } | undefined>
  onOpenChange: (open: boolean) => void
}

interface FolderCrumb {
  id: string | null
  name: string
}

interface ListFoldersResponse {
  data: FolderType[]
}

export function MoveItemsDialog({
  open,
  workspaceId,
  title,
  description,
  initialFolderId = null,
  excludedFolderIds = [],
  loading = false,
  createLoading = false,
  error,
  createError,
  onConfirm,
  onCreateFolder,
  onOpenChange,
}: MoveItemsDialogProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialFolderId)
  const [breadcrumbs, setBreadcrumbs] = useState<FolderCrumb[]>([{ id: null, name: "Root" }])
  const [newFolderName, setNewFolderName] = useState("")
  const foldersQuery = useQuery<ListFoldersResponse>({
    queryKey: ["folders", workspaceId, currentFolderId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (currentFolderId) params.set("parentFolderId", currentFolderId)
      const qs = params.toString()
      const response = await fetch(`/api/folders${qs ? `?${qs}` : ""}`, {
        credentials: "include",
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(body?.message ?? "Failed to load folders")
      }
      return (await response.json()) as ListFoldersResponse
    },
    enabled: open && workspaceId !== null,
  })
  const excluded = useMemo(() => new Set(excludedFolderIds), [excludedFolderIds])
  const visibleFolders: FolderType[] = (foldersQuery.data?.data ?? []).filter(
    (folder) => !excluded.has(folder.id),
  )
  const isBusy = loading || createLoading

  useEffect(() => {
    if (!open) return
    setCurrentFolderId(initialFolderId)
    setSelectedFolderId(initialFolderId)
    setBreadcrumbs([{ id: null, name: "Root" }])
    setNewFolderName("")
  }, [initialFolderId, open])

  const currentCrumb = breadcrumbs[breadcrumbs.length - 1] ?? { id: null, name: "Root" }
  const selectedLabel =
    selectedFolderId === null
      ? "Root"
      : (breadcrumbs.find((crumb) => crumb.id === selectedFolderId)?.name ??
        visibleFolders.find((folder) => folder.id === selectedFolderId)?.name ??
        "Selected folder")

  const handleOpenChange = (nextOpen: boolean) => {
    if (isBusy && !nextOpen) return
    onOpenChange(nextOpen)
  }

  const navigateToCrumb = (index: number) => {
    const nextCrumbs = breadcrumbs.slice(0, index + 1)
    const target = nextCrumbs[nextCrumbs.length - 1] ?? { id: null, name: "Root" }
    setBreadcrumbs(nextCrumbs)
    setCurrentFolderId(target.id)
    setSelectedFolderId(target.id)
  }

  const openFolder = (folder: { id: string; name: string }) => {
    setBreadcrumbs((current) => [...current, { id: folder.id, name: folder.name }])
    setCurrentFolderId(folder.id)
    setSelectedFolderId(folder.id)
  }

  const goUp = () => {
    if (breadcrumbs.length <= 1) return
    navigateToCrumb(breadcrumbs.length - 2)
  }

  const submitNewFolder = () => {
    const name = newFolderName.trim()
    if (!name) return
    void onCreateFolder(name, currentFolderId)
      .then((folder) => {
        setNewFolderName("")
        if (folder) setSelectedFolderId(folder.id)
      })
      .catch(() => {
        // The parent mutation exposes the error message in createError.
      })
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="border-border-default bg-surface-default fixed top-1/2 left-1/2 z-[61] flex max-h-[min(720px,calc(100vh-2rem))] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border shadow-xl">
          <div className="border-border-muted flex items-start justify-between gap-4 border-b p-5">
            <div className="min-w-0">
              <Dialog.Title className="text-text-primary text-base font-semibold">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-text-tertiary mt-1 text-sm leading-5">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close move dialog"
              disabled={isBusy}
              className="text-text-tertiary hover:bg-surface-hover hover:text-text-primary rounded-md p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <div className="flex flex-wrap items-center gap-1 text-sm">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.id ?? "root"} className="flex items-center gap-1">
                  {index > 0 && <ChevronRight className="text-text-tertiary h-3.5 w-3.5" />}
                  <button
                    type="button"
                    onClick={() => {
                      navigateToCrumb(index)
                    }}
                    disabled={isBusy}
                    className="text-text-secondary hover:bg-surface-hover hover:text-text-primary inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {crumb.id === null && <Home className="h-3.5 w-3.5" />}
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>

            <div className="border-border-default bg-surface-secondary rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFolderId(currentFolderId)
                  }}
                  disabled={isBusy}
                  className="border-accent/40 bg-accent/10 text-accent hover:bg-accent/15 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check className="h-4 w-4" />
                  Select {currentCrumb.name}
                </button>
                <button
                  type="button"
                  onClick={goUp}
                  disabled={isBusy || breadcrumbs.length <= 1}
                  className="border-border-muted text-text-secondary hover:bg-surface-hover rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="mr-1 inline h-4 w-4" />
                  Up
                </button>
              </div>
              <p className="text-text-tertiary mt-2 text-xs">Destination: {selectedLabel}</p>
            </div>

            <div className="border-border-default overflow-hidden rounded-xl border">
              {foldersQuery.isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="border-accent h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
                </div>
              ) : foldersQuery.isError ? (
                <p className="text-error p-4 text-sm">{foldersQuery.error.message}</p>
              ) : visibleFolders.length === 0 ? (
                <div className="p-8 text-center">
                  <FolderOpen className="text-text-tertiary mx-auto h-8 w-8" />
                  <p className="text-text-secondary mt-2 text-sm">No folders here</p>
                </div>
              ) : (
                <div className="divide-border-muted divide-y">
                  {visibleFolders.map((folder) => (
                    <div
                      key={folder.id}
                      className="hover:bg-surface-hover flex items-center gap-2 p-2 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFolderId(folder.id)
                        }}
                        disabled={isBusy}
                        className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          selectedFolderId === folder.id
                            ? "bg-accent/10 text-text-primary"
                            : "text-text-secondary"
                        }`}
                      >
                        <Folder className="text-text-tertiary h-4 w-4 shrink-0" />
                        <span className="truncate text-sm">{folder.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openFolder(folder)
                        }}
                        disabled={isBusy}
                        className="border-border-muted text-text-secondary hover:bg-surface-default rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Open
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-border-default bg-surface-secondary rounded-xl border p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={newFolderName}
                  onChange={(event) => {
                    setNewFolderName(event.target.value)
                  }}
                  placeholder={`New folder in ${currentCrumb.name}`}
                  disabled={isBusy}
                  className="border-border-default bg-surface-default text-text-primary placeholder:text-text-tertiary focus:border-accent focus:ring-accent min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={submitNewFolder}
                  disabled={isBusy || !newFolderName.trim()}
                  className="border-border-muted bg-surface-default text-text-primary hover:bg-surface-hover inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FolderPlus className="h-4 w-4" />
                  {createLoading ? "Creating..." : "New folder"}
                </button>
              </div>
              {createError && <p className="text-error mt-2 text-sm">{createError}</p>}
            </div>

            {error && <p className="text-error text-sm">{error}</p>}
          </div>

          <div className="border-border-muted flex flex-col-reverse gap-3 border-t p-5 sm:flex-row sm:justify-end">
            <Dialog.Close
              disabled={isBusy}
              className="border-border-muted text-text-secondary hover:bg-surface-hover rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={() => {
                onConfirm(selectedFolderId)
              }}
              disabled={isBusy || foldersQuery.isLoading}
              className="bg-accent hover:bg-accent/90 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Moving..." : "Move here"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
