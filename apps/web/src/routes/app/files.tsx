/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-plus-operands, @typescript-eslint/restrict-template-expressions */
import { useRef, useMemo, useCallback, useState, useEffect } from "react"
import { Upload, LayoutGrid, List, Trash2, FolderPlus, Star, X } from "lucide-react"
import {
  useFiles,
  useFolders,
  useBreadcrumbs,
  useWorkspaces,
  useCreateFolder,
  useSearchFiles,
  useTags,
  useToggleFavorite,
  useBatchUpload,
  type BreadcrumbItem,
 } from "@/lib/api"
import { } from "@/hooks/use-current-workspace"
import { useUndoableMutations } from "@/hooks/use-undoable-mutations"
import { getTagColorClasses } from "@/lib/tag-colors"
import { TagPickerDialog } from "@/components/features/tag-picker-dialog"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useSearchStore } from "@/stores/search-store"
import { useUploadStore } from "@/stores/upload-store"
import { useExplorerStore } from "@/stores/explorer-store"
import { UploadDropZone } from "@/components/features/upload-drop-zone"
import { UploadQueue } from "@/components/features/upload-queue"
import { FileList } from "@/components/features/file-list"
import { FileGrid } from "@/components/features/file-grid"
import { Breadcrumbs } from "@/components/features/breadcrumbs"
import { ShareModal } from "@/components/features/share-modal"
import { FilePreview } from "@/components/features/file-preview"
import { useExplorerShortcuts } from "@/hooks/use-explorer-shortcuts"
import { FILE_COMMAND_EVENT, type FileCommandAction } from "@/components/shared/commands/file-operations"
import { DndContext, DragOverlay } from "@dnd-kit/core"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import { can } from "@bucketdrive/shared"

const typeFilterOptions = [
  { value: "all", label: "All files" },
  { value: "documents", label: "Documents" },
  { value: "images", label: "Images" },
  { value: "videos", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "archives", label: "Archives" },
] as const

export function FilesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const addFiles = useUploadStore((s) => s.addFiles)
  const {
    viewMode,
    currentFolderId,
    sort,
    order,
    setViewMode,
    navigateTo,
    navigateToRoot,
    selectedFileIds,
    selectedFolderIds,
    clearSelection,
    previewFileId,
    setPreviewFileId,
  } = useExplorerStore()
  const dashboardSearch = useSearchStore((state) => state.dashboard)
  const setDashboardType = useSearchStore((state) => state.setDashboardType)
  const setDashboardFavoriteOnly = useSearchStore((state) => state.setDashboardFavoriteOnly)
  const setDashboardSelectedTagIds = useSearchStore((state) => state.setDashboardSelectedTagIds)
  const setDashboardSort = useSearchStore((state) => state.setDashboardSort)
  const setDashboardOrder = useSearchStore((state) => state.setDashboardOrder)
  const clearDashboardSearch = useSearchStore((state) => state.clearDashboardSearch)

  const debouncedQuery = useDebouncedValue(dashboardSearch.query.trim(), 300)
  const isSearchActive =
    debouncedQuery.length > 0 ||
    dashboardSearch.type !== "all" ||
    dashboardSearch.favoriteOnly ||
    dashboardSearch.selectedTagIds.length > 0

  const { data: workspacesData, isLoading: wsLoading } = useWorkspaces()

  const workspace = workspacesData?.data?.[0] ?? null
  const workspaceId = workspace?.id ?? null
  const workspaceName = workspace?.name ?? "Workspace"
  const canFavorite = workspace ? can(workspace.role, "files.favorite") : false
  const canTag = workspace ? can(workspace.role, "files.tag") : false

  const { data: filesData, isLoading: filesLoading } = useFiles(workspaceId, {
    folderId: currentFolderId,
    sort,
    order,
    page: 1,
    limit: 100,
    enabled: !isSearchActive,
  })

  const { data: searchData, isLoading: searchLoading } = useSearchFiles(workspaceId, {
    q: debouncedQuery || undefined,
    type: dashboardSearch.type,
    tags:
      dashboardSearch.selectedTagIds.length > 0
        ? dashboardSearch.selectedTagIds
        : undefined,
    favorite: dashboardSearch.favoriteOnly || undefined,
    sort:
      !debouncedQuery && dashboardSearch.sort === "relevance"
        ? sort
        : dashboardSearch.sort,
    order:
      !debouncedQuery && dashboardSearch.sort === "relevance"
        ? order
        : dashboardSearch.order,
    page: 1,
    limit: 100,
    enabled: isSearchActive,
  })

  const { data: foldersData, isLoading: foldersLoading } = useFolders(
    workspaceId,
    currentFolderId,
    !isSearchActive,
  )
  const { data: breadcrumbsData } = useBreadcrumbs(workspaceId, currentFolderId)
  const { data: tagsData } = useTags(workspaceId)

  const files = isSearchActive ? searchData?.data ?? [] : filesData?.data ?? []
  const folders = isSearchActive ? [] : foldersData?.data ?? []
  const isLoading = isSearchActive ? searchLoading : filesLoading || foldersLoading
  const allTags = tagsData?.data ?? []

  const undoable = useUndoableMutations(workspaceId)
  const createFolderMutation = useCreateFolder(workspaceId)
  const toggleFavoriteMutation = useToggleFavorite(workspaceId)
  const batchUpload = useBatchUpload(workspaceId)

  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [tagDialogFileId, setTagDialogFileId] = useState<string | null>(null)
  const [shareModal, setShareModal] = useState<{
    open: boolean
    resourceId: string
    resourceType: "file" | "folder"
    resourceName: string
  }>({ open: false, resourceId: "", resourceType: "file", resourceName: "" })

  const parseDragId = (dragId: string): { type: "file" | "folder"; id: string } | null => {
    const sep = dragId.indexOf("-")
    if (sep === -1) return null
    const type = dragId.slice(0, sep)
    const id = dragId.slice(sep + 1)
    if (type !== "file" && type !== "folder") return null
    return { type, id }
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const current = event.active.id as string
    setActiveDragId(current)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null)
      const { active, over } = event
      if (!over) return

      const source = parseDragId(active.id as string)
      const target = parseDragId(over.id as string)

      if (!source || !target) return
      if (source.id === target.id) return
      if (target.type !== "folder") return

      if (source.type === "file") {
        void undoable.moveFile(source.id, target.id, currentFolderId)
      } else {
        void undoable.moveFolder(source.id, target.id, currentFolderId)
      }
    },
    [undoable, currentFolderId],
  )

  const activeDragItem = useMemo(() => {
    if (!activeDragId) return null
    const parsed = parseDragId(activeDragId)
    if (!parsed) return null
    if (parsed.type === "file") {
      const file = files.find((f) => f.id === parsed.id)
      return file ? { name: file.originalName, type: "file" as const } : null
    }
    const folder = folders.find((f) => f.id === parsed.id)
    return folder ? { name: folder.name, type: "folder" as const } : null
  }, [activeDragId, files, folders])

  const handleItemDrop = useCallback(
    (_sourceId: string, _sourceType: "file" | "folder", _targetFolderId: string) => {
      // Drag-drop handled by DndContext handleDragEnd
    },
    [],
  )

  const items = useMemo(
    () => [
      ...folders.map((f) => ({ id: f.id, type: "folder" as const })),
      ...files.map((f) => ({ id: f.id, type: "file" as const })),
    ],
    [folders, files],
  )

  const handleContextDownload = useCallback(
    (fileId: string) => {
      const fetchUrl = async () => {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/files/${fileId}/download`,
          { credentials: "include" },
        )
        const data = (await res.json()) as { signedUrl?: string }
        if (data.signedUrl) {
          window.open(data.signedUrl, "_blank")
        }
      }
      fetchUrl().catch(console.error)
    },
    [workspaceId],
  )

  const handleOpenItem = useCallback(
    (id: string, type: "file" | "folder") => {
      if (type === "folder") {
        navigateTo(id)
      } else {
        const file = files.find((candidate) => candidate.id === id)
        if (file) {
          handleContextDownload(file.id)
        }
      }
    },
    [files, handleContextDownload, navigateTo],
  )

  const handlePreviewItem = useCallback(
    (id: string) => {
      const file = files.find((candidate) => candidate.id === id)
      if (file) {
        setPreviewFileId(file.id)
      }
    },
    [files, setPreviewFileId],
  )

  const handlePreviewNext = useCallback(() => {
    if (!previewFileId) return
    const fileIds = files.map((f) => f.id)
    const currentIndex = fileIds.indexOf(previewFileId)
    if (currentIndex >= 0 && currentIndex < fileIds.length - 1) {
      const nextId = fileIds[currentIndex + 1]
      if (nextId) setPreviewFileId(nextId)
    }
  }, [previewFileId, files, setPreviewFileId])

  const handlePreviewPrev = useCallback(() => {
    if (!previewFileId) return
    const fileIds = files.map((f) => f.id)
    const currentIndex = fileIds.indexOf(previewFileId)
    if (currentIndex > 0) {
      const prevId = fileIds[currentIndex - 1]
      if (prevId) setPreviewFileId(prevId)
    }
  }, [previewFileId, files, setPreviewFileId])

  const handleClosePreview = useCallback(() => {
    setPreviewFileId(null)
  }, [setPreviewFileId])

  const handleDeleteSelected = useCallback(() => {
    const fileCount = selectedFileIds.length
    const folderCount = selectedFolderIds.length
    const totalCount = fileCount + folderCount
    if (totalCount === 0) return

    const confirmed = window.confirm(
      totalCount === 1
        ? "Delete this item? It will be moved to trash."
        : `Delete ${totalCount} items? They will be moved to trash.`,
    )
    if (confirmed) {
      for (const fileId of selectedFileIds) {
        void undoable.deleteFile(fileId)
      }
      for (const folderId of selectedFolderIds) {
        void undoable.deleteFolder(folderId)
      }
      clearSelection()
    }
  }, [selectedFileIds, selectedFolderIds, undoable, clearSelection])

  const handleNavigateParent = useCallback(() => {
    if (currentFolderId && breadcrumbsData && breadcrumbsData.length > 1) {
      const parent = breadcrumbsData[breadcrumbsData.length - 2]
      if (parent) {
        navigateTo(parent.id)
      }
    } else {
      navigateToRoot()
    }
  }, [currentFolderId, breadcrumbsData, navigateTo, navigateToRoot])

  const handleRenameItem = useCallback(
    (id: string, type: "file" | "folder") => {
      const item =
        type === "file" ? files.find((f) => f.id === id) : folders.find((f) => f.id === id)
      const currentName = item ? ("originalName" in item ? item.originalName : item.name) : ""
      const newName = window.prompt("Rename to:", currentName)
      if (newName && newName.trim() && newName !== currentName) {
        if (type === "file") {
          void undoable.renameFile(id, newName.trim(), currentName)
        } else {
          void undoable.renameFolder(id, newName.trim(), currentName)
        }
      }
    },
    [files, folders, undoable],
  )

  useEffect(() => {
    function handleFileCommand(event: Event) {
      const action = (event as CustomEvent<FileCommandAction>).detail
      const selectedCount = selectedFileIds.length + selectedFolderIds.length

      if (action === "rename" && selectedCount === 1) {
        const fileId = selectedFileIds[0]
        const folderId = selectedFolderIds[0]
        if (fileId) handleRenameItem(fileId, "file")
        if (folderId) handleRenameItem(folderId, "folder")
      }

      if (action === "delete") {
        handleDeleteSelected()
      }

      if (action === "move" && selectedCount > 0) {
        useExplorerStore.getState().setClipboard({
          action: "cut",
          fileIds: selectedFileIds,
          folderIds: selectedFolderIds,
        })
      }

      if (action === "favorite" && selectedFileIds.length === 1 && selectedFolderIds.length === 0) {
        const fileId = selectedFileIds[0]
        if (fileId) {
          toggleFavoriteMutation.mutate({ fileId })
        }
      }
    }

    window.addEventListener(FILE_COMMAND_EVENT, handleFileCommand)
    return () => window.removeEventListener(FILE_COMMAND_EVENT, handleFileCommand)
  }, [
    handleDeleteSelected,
    handleRenameItem,
    selectedFileIds,
    selectedFolderIds,
    toggleFavoriteMutation,
  ])

  const { handleItemClick } = useExplorerShortcuts({
    items,
    containerRef,
    onOpenItem: handleOpenItem,
    onPreviewItem: handlePreviewItem,
    onDeleteSelected: handleDeleteSelected,
    onNavigateParent: handleNavigateParent,
    onRenameItem: handleRenameItem,
    onUndo: undoable.undo,
  })

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleCreateFolder = () => {
    const name = window.prompt("Folder name:")
    if (name && name.trim()) {
      createFolderMutation.mutate({
        name: name.trim(),
        parentFolderId: currentFolderId,
      })
    }
  }

  const handleContextMove = useCallback(
    (id: string, type: "file" | "folder") => {
      const destFolderId = window.prompt("Enter destination folder ID (or leave blank for root):")
      if (destFolderId === null) return
      const targetId = destFolderId.trim() || null
      if (type === "file") {
        void undoable.moveFile(id, targetId, currentFolderId)
      } else {
        void undoable.moveFolder(id, targetId, currentFolderId)
      }
    },
    [undoable, currentFolderId],
  )

  const handleContextShare = useCallback(
    (id: string, type: "file" | "folder") => {
      const item =
        type === "file" ? files.find((f) => f.id === id) : folders.find((f) => f.id === id)
      const name = item ? ("originalName" in item ? item.originalName : item.name) : ""
      setShareModal({ open: true, resourceId: id, resourceType: type, resourceName: name })
    },
    [files, folders],
  )

  const handleFilesChosen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosenFiles = Array.from(event.target.files ?? [])
    if (chosenFiles.length > 0) {
      addFiles(
        chosenFiles.map((file) => ({
          file,
          targetFolderId: currentFolderId ?? undefined,
        })),
      )
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleFilesDrop = useCallback(
    async (entries: Array<{ file: File; relativePath: string }>, emptyFolders: string[]) => {
      const hasStructure = entries.some((e) => e.relativePath.includes("/")) || emptyFolders.length > 0
      if (!hasStructure) {
        addFiles(
          entries.map((e) => ({
            file: e.file,
            targetFolderId: currentFolderId ?? undefined,
          })),
        )
        return
      }

      const now = Date.now()
      const uploadItems: Array<{
        id: string
        file: File
        relativePath: string
        targetFolderId?: string
      }> = entries.map((e, idx) => ({
        id: `upload-${String(now)}-${String(idx)}`,
        file: e.file,
        relativePath: e.relativePath,
        targetFolderId: currentFolderId ?? undefined,
      }))

      const store = useUploadStore.getState()
      store.addItems(
        uploadItems.map((u) => ({
          id: u.id,
          file: u.file,
          fileName: u.file.name,
          fileSize: u.file.size,
          mimeType: u.file.type || "application/octet-stream",
          progress: 0,
          status: "queued" as const,
          chunks: [],
          retryCount: 0,
          relativePath: u.relativePath,
          targetFolderId: u.targetFolderId,
        })),
      )

      try {
        const result = await batchUpload.mutateAsync({
          items: uploadItems.map((u) => ({
            clientId: u.id,
            relativePath: u.relativePath,
            mimeType: u.file.type || "application/octet-stream",
            sizeBytes: u.file.size,
          })),
          parentFolderId: currentFolderId,
          emptyFolders,
        })

        for (const res of result.items) {
          store.updateItem(res.clientId, {
            uploadId: res.uploadId,
            sessionId: res.sessionId,
            signedUrl: res.signedUrl,
            storageKey: res.storageKey,
            totalChunks: res.totalParts,
            chunkSize: res.partSize,
            targetFolderId: res.folderId ?? undefined,
          })
        }
      } catch {
        // Already in store as queued; processor will handle normally (initiateUpload per file)
      }
    },
    [addFiles, currentFolderId, batchUpload],
  )

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const files = e.clipboardData?.files ? Array.from(e.clipboardData.files) : []
      if (files.length === 0) return
      e.preventDefault()
      const entries = files.map((file) => ({ file, relativePath: file.name }))
      await handleFilesDrop(entries, [])
    }
    document.addEventListener("paste", handlePaste)
    return () => document.removeEventListener("paste", handlePaste)
  }, [handleFilesDrop])

  const handleFolderClick = (folderId: string) => {
    navigateTo(folderId)
  }

  const handleBreadcrumbNavigate = (id: string | null) => {
    if (id === null) {
      navigateToRoot()
    } else {
      navigateTo(id)
    }
  }

  const rootBreadcrumb: BreadcrumbItem[] = [{ id: null, name: workspaceName }]
  const displayBreadcrumbs = currentFolderId && breadcrumbsData ? breadcrumbsData : rootBreadcrumb
  const totalSelected = selectedFileIds.length + selectedFolderIds.length
  const totalFiles = isSearchActive ? searchData?.meta.total ?? 0 : filesData?.meta?.total ?? 0
  const selectedTagNames = allTags.filter((tag) => dashboardSearch.selectedTagIds.includes(tag.id))
  const fileForTagDialog = files.find((file) => file.id === tagDialogFileId) ?? null

  if (wsLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!workspaceId || !workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary">No workspace found</p>
          <p className="mt-1 text-xs text-text-tertiary">
            Create a workspace to start uploading files.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex h-full flex-col p-6">
        {!isSearchActive && (
          <div className="mb-4">
            <Breadcrumbs
              items={displayBreadcrumbs}
              onNavigate={handleBreadcrumbNavigate}
              currentFolderId={currentFolderId}
            />
          </div>
        )}

        <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">
              {isSearchActive ? "Search results" : "Files"}
            </h1>
            <p className="text-xs text-text-tertiary">
              {isSearchActive
                ? `${totalFiles} results across ${workspaceName}`
                : `${totalFiles} files${foldersData?.data?.length ? ` · ${foldersData.data.length} folders` : ""}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border-muted bg-surface-default p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`rounded-md p-1.5 transition-colors ${
                  viewMode === "grid"
                    ? "bg-surface-active text-text-primary"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`rounded-md p-1.5 transition-colors ${
                  viewMode === "list"
                    ? "bg-surface-active text-text-primary"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={handleCreateFolder}
              className="inline-flex items-center gap-2 rounded-lg border border-border-muted bg-surface-default px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
            >
              <FolderPlus className="h-4 w-4" />
              New Folder
            </button>
            <button
              onClick={handleFileSelect}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
            >
              <Upload className="h-4 w-4" />
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFilesChosen}
              className="hidden"
            />
          </div>
        </div>

        <div className="mb-4 space-y-3 rounded-2xl border border-border-default bg-surface-default p-4">
          <div className="flex flex-wrap gap-2">
            {typeFilterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setDashboardType(option.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  dashboardSearch.type === option.value
                    ? "bg-accent text-white"
                    : "bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                {option.label}
              </button>
            ))}

            <button
              onClick={() => setDashboardFavoriteOnly(!dashboardSearch.favoriteOnly)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                dashboardSearch.favoriteOnly
                  ? "bg-warning/20 text-warning"
                  : "bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              }`}
            >
              <Star className={`h-3.5 w-3.5 ${dashboardSearch.favoriteOnly ? "fill-warning" : ""}`} />
              Favorites
            </button>

            {isSearchActive && (
              <>
                <select
                  value={dashboardSearch.sort}
                  onChange={(event) =>
                    setDashboardSort(event.target.value as typeof dashboardSearch.sort)
                  }
                  className="rounded-full border border-border-default bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-primary outline-none focus:border-accent"
                >
                  {debouncedQuery && <option value="relevance">Relevance</option>}
                  <option value="name">Name</option>
                  <option value="created_at">Date</option>
                  <option value="size">Size</option>
                  <option value="type">Type</option>
                </select>
                <button
                  onClick={() =>
                    setDashboardOrder(dashboardSearch.order === "asc" ? "desc" : "asc")
                  }
                  className="rounded-full bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                >
                  {dashboardSearch.order === "asc" ? "Ascending" : "Descending"}
                </button>
                <button
                  onClick={clearDashboardSearch}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear search
                </button>
              </>
            )}
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Tags
              </span>
              {allTags.map((tag) => {
                const selected = dashboardSearch.selectedTagIds.includes(tag.id)
                const colorClasses = getTagColorClasses(tag.color)

                return (
                  <button
                    key={tag.id}
                    onClick={() => {
                      setDashboardSelectedTagIds(
                        selected
                          ? dashboardSearch.selectedTagIds.filter((id) => id !== tag.id)
                          : [...dashboardSearch.selectedTagIds, tag.id],
                      )
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? `border-transparent ${colorClasses.chipClassName}`
                        : "border-border-default bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    }`}
                  >
                    {tag.name}
                  </button>
                )
              })}
            </div>
          )}

          {isSearchActive && (
            <div className="flex flex-wrap gap-2">
              {debouncedQuery && (
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                  Query: {debouncedQuery}
                </span>
              )}
              {dashboardSearch.favoriteOnly && (
                <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                  Favorites only
                </span>
              )}
              {dashboardSearch.type !== "all" && (
                <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-text-primary">
                  Type: {typeFilterOptions.find((option) => option.value === dashboardSearch.type)?.label}
                </span>
              )}
              {selectedTagNames.map((tag) => (
                <span
                  key={tag.id}
                  className={[
                    "rounded-full px-3 py-1 text-xs font-medium",
                    getTagColorClasses(tag.color).chipClassName,
                  ].join(" ")}
                >
                  Tag: {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {totalSelected > 1 && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-accent bg-accent/10 px-4 py-2">
            <span className="text-sm font-medium text-text-primary">
              {totalSelected} items selected
            </span>
            <div className="flex-1" />
            <button
              onClick={handleDeleteSelected}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-error transition-colors hover:bg-error/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete selected
            </button>
            <button
              onClick={() => clearSelection()}
              className="rounded-md px-3 py-1.5 text-sm text-text-tertiary transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex-1 space-y-4" ref={containerRef}>
          <UploadDropZone onFilesDrop={handleFilesDrop} className="bg-surface-default" />
          <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {viewMode === "grid" ? (
              <FileGrid
                workspaceId={workspaceId}
                folders={folders}
                files={files}
                isLoading={isLoading}
                onFolderClick={handleFolderClick}
                onItemClick={handleItemClick}
                onContextOpen={handleOpenItem}
                onContextPreview={handlePreviewItem}
                onContextDownload={handleContextDownload}
                onContextRename={handleRenameItem}
                onContextDelete={(id, type) => {
                  if (type === "folder") {
                    void undoable.deleteFolder(id)
                  } else {
                    void undoable.deleteFile(id)
                  }
                  clearSelection()
                }}
                onContextFavorite={
                  canFavorite
                    ? (id) => {
                        toggleFavoriteMutation.mutate({ fileId: id })
                      }
                    : undefined
                }
                onContextTags={
                  canTag
                    ? (id) => {
                        setTagDialogFileId(id)
                      }
                    : undefined
                }
                onContextMove={handleContextMove}
                onContextShare={handleContextShare}
                onItemDrop={!isSearchActive ? handleItemDrop : undefined}
              />
            ) : (
              <FileList
                workspaceId={workspaceId}
                folders={folders}
                files={files}
                isLoading={isLoading}
                onFolderClick={handleFolderClick}
                onItemClick={handleItemClick}
                onContextOpen={handleOpenItem}
                onContextPreview={handlePreviewItem}
                onContextDownload={handleContextDownload}
                onContextRename={handleRenameItem}
                onContextDelete={(id, type) => {
                  if (type === "folder") {
                    void undoable.deleteFolder(id)
                  } else {
                    void undoable.deleteFile(id)
                  }
                  clearSelection()
                }}
                onContextFavorite={
                  canFavorite
                    ? (id) => {
                        toggleFavoriteMutation.mutate({ fileId: id })
                      }
                    : undefined
                }
                onContextTags={
                  canTag
                    ? (id) => {
                        setTagDialogFileId(id)
                      }
                    : undefined
                }
                onContextMove={handleContextMove}
                onContextShare={handleContextShare}
                onItemDrop={!isSearchActive ? handleItemDrop : undefined}
              />
            )}
            <DragOverlay dropAnimation={null}>
              {activeDragItem ? (
                <div className="flex items-center gap-2 rounded-lg border border-accent bg-surface-default px-3 py-2 shadow-lg">
                  {activeDragItem.type === "folder" ? (
                    <FolderPlus className="h-4 w-4 text-text-tertiary" />
                  ) : (
                    <Upload className="h-4 w-4 text-text-tertiary" />
                  )}
                  <span className="text-sm font-medium text-text-primary">{activeDragItem.name}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {workspaceId && <UploadQueue workspaceId={workspaceId} />}

        {previewFileId && (() => {
          const previewFile = files.find((f) => f.id === previewFileId)
          if (!previewFile || !workspaceId) return null
          const fileIds = files.map((f) => f.id)
          const currentIndex = fileIds.indexOf(previewFileId)
          return (
            <FilePreview
              file={previewFile}
              workspaceId={workspaceId}
              hasNext={currentIndex >= 0 && currentIndex < fileIds.length - 1}
              hasPrev={currentIndex > 0}
              onNext={handlePreviewNext}
              onPrev={handlePreviewPrev}
              onClose={handleClosePreview}
              onDownload={handleContextDownload}
            />
          )
        })()}

        <ShareModal
          open={shareModal.open}
          onOpenChange={(open) => setShareModal((prev) => ({ ...prev, open }))}
          workspaceId={workspaceId ?? ""}
          resourceId={shareModal.resourceId}
          resourceType={shareModal.resourceType}
          resourceName={shareModal.resourceName}
        />
      </div>

      <TagPickerDialog
        open={tagDialogFileId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTagDialogFileId(null)
          }
        }}
        workspaceId={workspaceId}
        file={fileForTagDialog}
        canManageTags={canTag}
      />
    </>
  )
}
