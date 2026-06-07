/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-plus-operands, @typescript-eslint/restrict-template-expressions */
import { useRef, useMemo, useCallback, useState, useEffect } from "react"
import { Upload, LayoutGrid, List, Trash2, FolderPlus, Star, X, ArrowRightLeft } from "lucide-react"
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
  useBatchTrash,
  useBatchMove,
  type BreadcrumbItem,
} from "@/lib/api"
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
import { SelectionMarquee } from "@/components/features/selection-marquee"
import { useExplorerShortcuts } from "@/hooks/use-explorer-shortcuts"
import {
  FILE_COMMAND_EVENT,
  type FileCommandAction,
} from "@/components/shared/commands/file-operations"
import {
  ActionButton,
  PageHeader,
  PageToolbar,
  SegmentedControl,
} from "@/components/shared/page-layout"
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import type { WorkspaceRole } from "@bucketdrive/shared"
import { DEFAULT_BRAND_NAME } from "@/lib/branding"

const typeFilterOptions = [
  { value: "all", label: "All files" },
  { value: "documents", label: "Documents" },
  { value: "images", label: "Images" },
  { value: "videos", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "archives", label: "Archives" },
] as const

const workspaceRoles: readonly WorkspaceRole[] = [
  "owner",
  "admin",
  "manager",
  "editor",
  "viewer",
  "guest",
]

function normalizeWorkspaceRole(role: unknown): WorkspaceRole {
  const normalized = typeof role === "string" ? role.split(",")[0]?.trim().toLowerCase() : "viewer"
  return workspaceRoles.includes(normalized as WorkspaceRole)
    ? (normalized as WorkspaceRole)
    : "viewer"
}

export function FilesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const routeSearch = useRouterState({
    select: (state) => state.location.search,
  })
  const routeFolderId = routeSearch.folderId ?? null
  const routePreviewFileId = routeSearch.previewFileId ?? null
  const addFiles = useUploadStore((s) => s.addFiles)
  const {
    viewMode,
    currentFolderId,
    sort,
    order,
    setViewMode,
    navigateTo,
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

  useEffect(() => {
    if (currentFolderId !== routeFolderId) {
      navigateTo(routeFolderId)
    }
  }, [currentFolderId, routeFolderId, navigateTo])

  useEffect(() => {
    if (previewFileId !== routePreviewFileId) {
      setPreviewFileId(routePreviewFileId)
    }
  }, [previewFileId, routePreviewFileId, setPreviewFileId])

  const navigateFiles = useCallback(
    (folderId: string | null, nextPreviewFileId: string | null = null) => {
      void navigate({
        to: "/dashboard/files",
        search: {
          folderId: folderId ?? undefined,
          previewFileId: nextPreviewFileId ?? undefined,
        },
      })
    },
    [navigate],
  )

  const debouncedQuery = useDebouncedValue(dashboardSearch.query.trim(), 300)
  const isSearchActive =
    debouncedQuery.length > 0 ||
    dashboardSearch.type !== "all" ||
    dashboardSearch.favoriteOnly ||
    dashboardSearch.selectedTagIds.length > 0

  const { data: workspacesData, isLoading: wsLoading } = useWorkspaces()

  const workspace = workspacesData?.data?.[0] ?? null
  const workspaceId = workspace?.id ?? null
  const bucketName = workspace?.name ?? DEFAULT_BRAND_NAME
  const workspaceRole = normalizeWorkspaceRole(workspace?.role)
  const canEditContent =
    workspaceRole === "owner" ||
    workspaceRole === "admin" ||
    workspaceRole === "manager" ||
    workspaceRole === "editor"
  const canManageContent =
    workspaceRole === "owner" || workspaceRole === "admin" || workspaceRole === "manager"
  const canUpload = Boolean(workspace) && canEditContent
  const canCreateFolder = Boolean(workspace) && canEditContent
  const canRenameFile = Boolean(workspace) && canEditContent
  const canRenameFolder = Boolean(workspace) && canEditContent
  const canMoveFile = Boolean(workspace) && canEditContent
  const canMoveFolder = Boolean(workspace) && canEditContent
  const canDeleteFile = Boolean(workspace) && canManageContent
  const canDeleteFolder = Boolean(workspace) && canManageContent
  const canShareFile = Boolean(workspace) && canEditContent
  const canShareFolder = Boolean(workspace) && canEditContent
  const canFavorite = Boolean(workspace) && canEditContent
  const canTag = Boolean(workspace) && canEditContent

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
    tags: dashboardSearch.selectedTagIds.length > 0 ? dashboardSearch.selectedTagIds : undefined,
    favorite: dashboardSearch.favoriteOnly || undefined,
    sort: !debouncedQuery && dashboardSearch.sort === "relevance" ? sort : dashboardSearch.sort,
    order: !debouncedQuery && dashboardSearch.sort === "relevance" ? order : dashboardSearch.order,
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

  const files = isSearchActive ? (searchData?.data ?? []) : (filesData?.data ?? [])
  const folders = isSearchActive ? [] : (foldersData?.data ?? [])
  const isLoading = isSearchActive ? searchLoading : filesLoading || foldersLoading
  const allTags = tagsData?.data ?? []

  const undoable = useUndoableMutations(workspaceId)
  const createFolderMutation = useCreateFolder(workspaceId)
  const toggleFavoriteMutation = useToggleFavorite(workspaceId)
  const batchUpload = useBatchUpload(workspaceId)
  const batchTrash = useBatchTrash(workspaceId)
  const batchMove = useBatchMove(workspaceId)

  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [selectionRect, setSelectionRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const selectionStartRef = useRef<{ x: number; y: number; additive: boolean } | null>(null)
  const selectionBaseRef = useRef<{ fileIds: string[]; folderIds: string[] }>({
    fileIds: [],
    folderIds: [],
  })
  const [tagDialogFileId, setTagDialogFileId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [shareModal, setShareModal] = useState<{
    open: boolean
    resourceId: string
    resourceType: "file" | "folder"
    resourceName: string
    resourceStorageKey?: string
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
      const overData = over.data.current as { type?: "file" | "folder"; id?: string } | undefined

      if (!source || !target) return
      if (source.id === target.id) return
      if (target.type !== "folder" || overData?.type !== "folder") return

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
      if (!workspaceId) return
      const fetchUrl = async () => {
        setDownloadError(null)
        const res = await fetch(`/api/files/${fileId}/download`, {
          credentials: "include",
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { message?: string } | null
          throw new Error(data?.message ?? "Download failed")
        }
        const data = (await res.json()) as { signedUrl?: string; fileName?: string }
        if (data.signedUrl) {
          const link = document.createElement("a")
          link.href = data.signedUrl
          link.download = data.fileName ?? ""
          link.rel = "noopener"
          document.body.append(link)
          link.click()
          link.remove()
        } else {
          throw new Error("Download URL was not returned")
        }
      }
      fetchUrl().catch((error: unknown) => {
        setDownloadError(error instanceof Error ? error.message : "Download failed")
      })
    },
    [workspaceId],
  )

  const handleOpenItem = useCallback(
    (id: string, type: "file" | "folder") => {
      if (type === "folder") {
        navigateFiles(id)
      } else {
        const file = files.find((candidate) => candidate.id === id)
        if (file) {
          navigateFiles(currentFolderId, file.id)
        }
      }
    },
    [currentFolderId, files, navigateFiles],
  )

  const handlePreviewItem = useCallback(
    (id: string) => {
      const file = files.find((candidate) => candidate.id === id)
      if (file) {
        navigateFiles(currentFolderId, file.id)
      }
    },
    [currentFolderId, files, navigateFiles],
  )

  const handlePreviewNext = useCallback(() => {
    if (!previewFileId) return
    const fileIds = files.map((f) => f.id)
    const currentIndex = fileIds.indexOf(previewFileId)
    if (currentIndex >= 0 && currentIndex < fileIds.length - 1) {
      const nextId = fileIds[currentIndex + 1]
      if (nextId) navigateFiles(currentFolderId, nextId)
    }
  }, [currentFolderId, previewFileId, files, navigateFiles])

  const handlePreviewPrev = useCallback(() => {
    if (!previewFileId) return
    const fileIds = files.map((f) => f.id)
    const currentIndex = fileIds.indexOf(previewFileId)
    if (currentIndex > 0) {
      const prevId = fileIds[currentIndex - 1]
      if (prevId) navigateFiles(currentFolderId, prevId)
    }
  }, [currentFolderId, previewFileId, files, navigateFiles])

  const handleClosePreview = useCallback(() => {
    navigateFiles(currentFolderId)
  }, [currentFolderId, navigateFiles])

  const handleDeleteSelected = useCallback(() => {
    const fileCount = selectedFileIds.length
    const folderCount = selectedFolderIds.length
    const totalCount = fileCount + folderCount
    if (totalCount === 0) return
    if ((fileCount > 0 && !canDeleteFile) || (folderCount > 0 && !canDeleteFolder)) return

    const confirmed = window.confirm(
      totalCount === 1
        ? "Delete this item? It will be moved to trash."
        : `Delete ${totalCount} items? They will be moved to trash.`,
    )
    if (confirmed) {
      batchTrash.mutate(
        { files: selectedFileIds, folders: selectedFolderIds },
        { onSuccess: () => clearSelection() },
      )
    }
  }, [
    selectedFileIds,
    selectedFolderIds,
    batchTrash,
    clearSelection,
    canDeleteFile,
    canDeleteFolder,
  ])

  const handleMoveSelected = useCallback(() => {
    const totalCount = selectedFileIds.length + selectedFolderIds.length
    if (totalCount === 0) return
    if (
      (selectedFileIds.length > 0 && !canMoveFile) ||
      (selectedFolderIds.length > 0 && !canMoveFolder)
    ) {
      return
    }

    const destFolderId = window.prompt("Enter destination folder ID (or leave blank for root):")
    if (destFolderId === null) return
    batchMove.mutate(
      {
        files: selectedFileIds,
        folders: selectedFolderIds,
        targetFolderId: destFolderId.trim() || null,
      },
      { onSuccess: () => clearSelection() },
    )
  }, [selectedFileIds, selectedFolderIds, batchMove, clearSelection, canMoveFile, canMoveFolder])

  const handleNavigateParent = useCallback(() => {
    if (currentFolderId && breadcrumbsData && breadcrumbsData.length > 1) {
      const parent = breadcrumbsData[breadcrumbsData.length - 2]
      if (parent) {
        navigateFiles(parent.id)
      }
    } else {
      navigateFiles(null)
    }
  }, [currentFolderId, breadcrumbsData, navigateFiles])

  const handleRenameItem = useCallback(
    (id: string, type: "file" | "folder") => {
      if ((type === "file" && !canRenameFile) || (type === "folder" && !canRenameFolder)) return
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
    [files, folders, undoable, canRenameFile, canRenameFolder],
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
        if (
          (selectedFileIds.length > 0 && !canMoveFile) ||
          (selectedFolderIds.length > 0 && !canMoveFolder)
        ) {
          return
        }
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
    canMoveFile,
    canMoveFolder,
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
    if (!canUpload) return
    fileInputRef.current?.click()
  }

  const handleFolderSelect = () => {
    if (!canUpload) return
    folderInputRef.current?.click()
  }

  const handleCreateFolder = () => {
    if (!canCreateFolder) return
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
      if ((type === "file" && !canMoveFile) || (type === "folder" && !canMoveFolder)) return
      const destFolderId = window.prompt("Enter destination folder ID (or leave blank for root):")
      if (destFolderId === null) return
      const targetId = destFolderId.trim() || null
      if (type === "file") {
        void undoable.moveFile(id, targetId, currentFolderId)
      } else {
        void undoable.moveFolder(id, targetId, currentFolderId)
      }
    },
    [undoable, currentFolderId, canMoveFile, canMoveFolder],
  )

  const handleContextShare = useCallback(
    (id: string, type: "file" | "folder") => {
      if ((type === "file" && !canShareFile) || (type === "folder" && !canShareFolder)) return
      const item =
        type === "file" ? files.find((f) => f.id === id) : folders.find((f) => f.id === id)
      const name = item ? ("originalName" in item ? item.originalName : item.name) : ""
      setShareModal({
        open: true,
        resourceId: id,
        resourceType: type,
        resourceName: name,
        resourceStorageKey: item && "storageKey" in item ? item.storageKey : undefined,
      })
    },
    [files, folders, canShareFile, canShareFolder],
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
      const hasStructure =
        entries.some((e) => e.relativePath.includes("/")) || emptyFolders.length > 0
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
          status: "preparing" as const,
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
            status: "queued",
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to prepare folder upload"
        for (const item of uploadItems) {
          store.updateItem(item.id, {
            status: "failed",
            error: message,
          })
        }
      }
    },
    [addFiles, currentFolderId, batchUpload],
  )

  const handleFolderFilesChosen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosenFiles = Array.from(event.target.files ?? [])
    if (chosenFiles.length > 0) {
      void handleFilesDrop(
        chosenFiles.map((file) => ({
          file,
          relativePath: file.webkitRelativePath || file.name,
        })),
        [],
      )
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = ""
    }
  }

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
    navigateFiles(folderId)
  }

  const handleBreadcrumbNavigate = (id: string | null) => {
    navigateFiles(id)
  }

  const rootBreadcrumb: BreadcrumbItem[] = [{ id: null, name: bucketName }]
  const displayBreadcrumbs = currentFolderId && breadcrumbsData ? breadcrumbsData : rootBreadcrumb
  const totalSelected = selectedFileIds.length + selectedFolderIds.length
  const canDeleteSelected =
    totalSelected > 0 &&
    (selectedFileIds.length === 0 || canDeleteFile) &&
    (selectedFolderIds.length === 0 || canDeleteFolder)
  const totalFiles = isSearchActive ? (searchData?.meta.total ?? 0) : (filesData?.meta?.total ?? 0)
  const selectedTagNames = allTags.filter((tag) => dashboardSearch.selectedTagIds.includes(tag.id))
  const fileForTagDialog = files.find((file) => file.id === tagDialogFileId) ?? null
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  )

  const getSelectionRect = (startX: number, startY: number, endX: number, endY: number) => ({
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  })

  const handleSelectionPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (
      target.closest(
        "button,a,input,select,textarea,[role='button'],[data-selectable-item],[data-selection-ignore]",
      )
    ) {
      return
    }
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) clearSelection()
    event.preventDefault()
    document.body.classList.add("selection-dragging")
    selectionBaseRef.current =
      event.ctrlKey || event.metaKey
        ? { fileIds: selectedFileIds, folderIds: selectedFolderIds }
        : { fileIds: [], folderIds: [] }
    selectionStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      additive: event.ctrlKey || event.metaKey,
    }
    setSelectionRect(getSelectionRect(event.clientX, event.clientY, event.clientX, event.clientY))
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const updateDragSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = selectionStartRef.current
    const container = containerRef.current
    if (!start || !container) return
    const rect = getSelectionRect(start.x, start.y, event.clientX, event.clientY)
    event.preventDefault()
    setSelectionRect(rect)
    if (rect.width < 4 && rect.height < 4) {
      useExplorerStore
        .getState()
        .selectAll(selectionBaseRef.current.fileIds, selectionBaseRef.current.folderIds)
      return
    }

    const selectionBox = new DOMRect(rect.left, rect.top, rect.width, rect.height)
    const fileIds = start.additive ? [...selectionBaseRef.current.fileIds] : []
    const folderIds = start.additive ? [...selectionBaseRef.current.folderIds] : []
    for (const node of container.querySelectorAll<HTMLElement>("[data-selectable-item]")) {
      const itemRect = node.getBoundingClientRect()
      const intersects =
        selectionBox.left <= itemRect.right &&
        selectionBox.right >= itemRect.left &&
        selectionBox.top <= itemRect.bottom &&
        selectionBox.bottom >= itemRect.top
      if (!intersects) continue
      const id = node.dataset.itemId
      const type = node.dataset.itemType
      if (!id || !type) continue
      if (type === "file" && !fileIds.includes(id)) fileIds.push(id)
      if (type === "folder" && !folderIds.includes(id)) folderIds.push(id)
    }
    useExplorerStore.getState().selectAll(fileIds, folderIds)
  }

  const handleSelectionPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    updateDragSelection(event)
  }

  const handleSelectionPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    updateDragSelection(event)
    selectionStartRef.current = null
    selectionBaseRef.current = { fileIds: [], folderIds: [] }
    setSelectionRect(null)
    document.body.classList.remove("selection-dragging")
  }

  const handleSelectionPointerCancel = () => {
    selectionStartRef.current = null
    selectionBaseRef.current = { fileIds: [], folderIds: [] }
    setSelectionRect(null)
    document.body.classList.remove("selection-dragging")
  }

  useEffect(() => {
    return () => {
      document.body.classList.remove("selection-dragging")
    }
  }, [])

  if (wsLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="border-accent h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  if (!workspaceId || !workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <p className="text-text-primary text-sm font-medium">No bucket found</p>
          <p className="text-text-tertiary mt-1 text-xs">Sign in to start uploading files.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <SelectionMarquee rect={selectionRect} />
      <div
        className="flex h-full flex-col p-6"
        data-testid="files-page"
        data-workspace-role={workspaceRole}
      >
        {!isSearchActive && (
          <div className="mb-4">
            <Breadcrumbs
              items={displayBreadcrumbs}
              onNavigate={handleBreadcrumbNavigate}
              currentFolderId={currentFolderId}
            />
          </div>
        )}

        <PageHeader
          title={isSearchActive ? "Search results" : "Files"}
          description={
            isSearchActive
              ? `${totalFiles} results across ${bucketName}`
              : `${totalFiles} files${foldersData?.data?.length ? ` · ${foldersData.data.length} folders` : ""}`
          }
          actions={
            <>
              {canCreateFolder && (
                <ActionButton
                  variant="secondary"
                  icon={<FolderPlus className="h-4 w-4" />}
                  onClick={handleCreateFolder}
                >
                  New Folder
                </ActionButton>
              )}
              {canUpload && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <ActionButton variant="primary" icon={<Upload className="h-4 w-4" />}>
                      Upload
                    </ActionButton>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      className="border-border-default bg-surface-default z-50 min-w-40 rounded-lg border p-1 shadow-lg"
                    >
                      <DropdownMenu.Item
                        onSelect={handleFileSelect}
                        className="text-text-primary hover:bg-surface-hover focus:bg-surface-hover cursor-pointer rounded-md px-3 py-2 text-sm outline-none"
                      >
                        Files
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onSelect={handleFolderSelect}
                        className="text-text-primary hover:bg-surface-hover focus:bg-surface-hover cursor-pointer rounded-md px-3 py-2 text-sm outline-none"
                      >
                        Folder
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFilesChosen}
                className="hidden"
              />
              <input
                ref={folderInputRef}
                type="file"
                multiple
                onChange={handleFolderFilesChosen}
                className="hidden"
                {...{ webkitdirectory: "", directory: "" }}
              />
            </>
          }
        />

        {downloadError && (
          <div className="border-error/40 bg-error/10 text-error mb-4 rounded-lg border px-4 py-3 text-sm">
            {downloadError}
          </div>
        )}

        <PageToolbar className="relative items-start">
          <div
            className={
              totalSelected > 0
                ? "invisible flex w-full min-w-0 items-center gap-2"
                : "flex w-full min-w-0 items-center gap-2"
            }
          >
            <SegmentedControl
              value={viewMode}
              onChange={setViewMode}
              ariaLabel="File view mode"
              options={[
                {
                  value: "grid",
                  label: <LayoutGrid className="h-4 w-4" />,
                  ariaLabel: "Grid view",
                },
                {
                  value: "list",
                  label: <List className="h-4 w-4" />,
                  ariaLabel: "List view",
                },
              ]}
            />
            <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
              {typeFilterOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => setDashboardType(option.value)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    dashboardSearch.type === option.value
                      ? "bg-accent text-white"
                      : "bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  }`}
                >
                  {option.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setDashboardFavoriteOnly(!dashboardSearch.favoriteOnly)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  dashboardSearch.favoriteOnly
                    ? "bg-warning/20 text-warning"
                    : "bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                <Star
                  className={`h-3.5 w-3.5 ${dashboardSearch.favoriteOnly ? "fill-warning" : ""}`}
                />
                Favorites
              </button>

              {isSearchActive && (
                <>
                  <select
                    value={dashboardSearch.sort}
                    onChange={(event) =>
                      setDashboardSort(event.target.value as typeof dashboardSearch.sort)
                    }
                    className="border-border-default bg-surface-secondary text-text-primary focus:border-accent rounded-full border px-3 py-1.5 text-xs font-medium outline-none"
                  >
                    {debouncedQuery && <option value="relevance">Relevance</option>}
                    <option value="name">Name</option>
                    <option value="created_at">Date</option>
                    <option value="size">Size</option>
                    <option value="type">Type</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setDashboardOrder(dashboardSearch.order === "asc" ? "desc" : "asc")
                    }
                    className="bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    {dashboardSearch.order === "asc" ? "Ascending" : "Descending"}
                  </button>
                  <button
                    type="button"
                    onClick={clearDashboardSearch}
                    className="bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear search
                  </button>
                </>
              )}
            </div>

            {allTags.length > 0 && (
              <div className="hidden min-w-0 items-center gap-2 xl:flex">
                <span className="text-text-tertiary text-xs font-medium tracking-wide uppercase">
                  Tags
                </span>
                {allTags.map((tag) => {
                  const selected = dashboardSearch.selectedTagIds.includes(tag.id)
                  const colorClasses = getTagColorClasses(tag.color)

                  return (
                    <button
                      type="button"
                      key={tag.id}
                      onClick={() => {
                        setDashboardSelectedTagIds(
                          selected
                            ? dashboardSearch.selectedTagIds.filter((id) => id !== tag.id)
                            : [...dashboardSearch.selectedTagIds, tag.id],
                        )
                      }}
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
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
              <div className="hidden min-w-0 gap-2 2xl:flex">
                {debouncedQuery && (
                  <span className="bg-accent/10 text-accent shrink-0 rounded-full px-3 py-1 text-xs font-medium">
                    Query: {debouncedQuery}
                  </span>
                )}
                {dashboardSearch.favoriteOnly && (
                  <span className="bg-warning/10 text-warning shrink-0 rounded-full px-3 py-1 text-xs font-medium">
                    Favorites only
                  </span>
                )}
                {dashboardSearch.type !== "all" && (
                  <span className="bg-surface-secondary text-text-primary shrink-0 rounded-full px-3 py-1 text-xs font-medium">
                    Type:{" "}
                    {
                      typeFilterOptions.find((option) => option.value === dashboardSearch.type)
                        ?.label
                    }
                  </span>
                )}
                {selectedTagNames.map((tag) => (
                  <span
                    key={tag.id}
                    className={[
                      "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
                      getTagColorClasses(tag.color).chipClassName,
                    ].join(" ")}
                  >
                    Tag: {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {totalSelected > 0 && (
            <div className="absolute inset-0 flex items-center gap-2 p-3">
              <span className="text-text-primary shrink-0 text-sm font-medium">
                {totalSelected} item{totalSelected === 1 ? "" : "s"} selected
              </span>
              <div className="flex-1" />
              <div className="flex flex-wrap items-center justify-end gap-2">
                {(canMoveFile || canMoveFolder) && (
                  <button
                    type="button"
                    onClick={handleMoveSelected}
                    className="text-text-secondary hover:bg-surface-hover hover:text-text-primary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Move selected
                  </button>
                )}
                {canDeleteSelected && (
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="text-error hover:bg-error/10 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete selected
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => clearSelection()}
                  className="text-text-tertiary hover:bg-surface-hover hover:text-text-primary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          )}
        </PageToolbar>

        <div className="relative flex-1 space-y-4" ref={containerRef}>
          <UploadDropZone
            onFilesDrop={handleFilesDrop}
            onClickUpload={handleFileSelect}
            className="bg-surface-default"
          />
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                onContextRename={
                  canRenameFile || canRenameFolder
                    ? (id, type) => handleRenameItem(id, type)
                    : undefined
                }
                onContextDelete={
                  canDeleteFile || canDeleteFolder
                    ? (id, type) => {
                        if (
                          (type === "folder" && !canDeleteFolder) ||
                          (type === "file" && !canDeleteFile)
                        )
                          return
                        if (type === "folder") {
                          void undoable.deleteFolder(id)
                        } else {
                          void undoable.deleteFile(id)
                        }
                        clearSelection()
                      }
                    : undefined
                }
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
                onContextMove={canMoveFile || canMoveFolder ? handleContextMove : undefined}
                onContextShare={canShareFile || canShareFolder ? handleContextShare : undefined}
                onItemDrop={!isSearchActive ? handleItemDrop : undefined}
                onSelectionPointerDown={handleSelectionPointerDown}
                onSelectionPointerMove={handleSelectionPointerMove}
                onSelectionPointerUp={handleSelectionPointerUp}
                onSelectionPointerCancel={handleSelectionPointerCancel}
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
                onContextRename={
                  canRenameFile || canRenameFolder
                    ? (id, type) => handleRenameItem(id, type)
                    : undefined
                }
                onContextDelete={
                  canDeleteFile || canDeleteFolder
                    ? (id, type) => {
                        if (
                          (type === "folder" && !canDeleteFolder) ||
                          (type === "file" && !canDeleteFile)
                        )
                          return
                        if (type === "folder") {
                          void undoable.deleteFolder(id)
                        } else {
                          void undoable.deleteFile(id)
                        }
                        clearSelection()
                      }
                    : undefined
                }
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
                onContextMove={canMoveFile || canMoveFolder ? handleContextMove : undefined}
                onContextShare={canShareFile || canShareFolder ? handleContextShare : undefined}
                onItemDrop={!isSearchActive ? handleItemDrop : undefined}
                onSelectionPointerDown={handleSelectionPointerDown}
                onSelectionPointerMove={handleSelectionPointerMove}
                onSelectionPointerUp={handleSelectionPointerUp}
                onSelectionPointerCancel={handleSelectionPointerCancel}
              />
            )}
            <DragOverlay dropAnimation={null}>
              {activeDragItem ? (
                <div className="border-accent bg-surface-default flex items-center gap-2 rounded-lg border px-3 py-2 shadow-lg">
                  {activeDragItem.type === "folder" ? (
                    <FolderPlus className="text-text-tertiary h-4 w-4" />
                  ) : (
                    <Upload className="text-text-tertiary h-4 w-4" />
                  )}
                  <span className="text-text-primary text-sm font-medium">
                    {activeDragItem.name}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {workspaceId && <UploadQueue workspaceId={workspaceId} />}

        {previewFileId &&
          (() => {
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
          resourceStorageKey={shareModal.resourceStorageKey}
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
