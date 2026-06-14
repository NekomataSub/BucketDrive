/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-plus-operands, @typescript-eslint/restrict-template-expressions */

import { useRef, useMemo, useCallback, useState, useEffect } from "react"
import {
  Upload,
  LayoutGrid,
  List,
  Trash2,
  FolderPlus,
  Star,
  X,
  ArrowRightLeft,
  Copy,
  Download,
  Share2,
  Tags,
} from "lucide-react"
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
import { useSearchStore, type SearchSort } from "@/stores/search-store"
import { useUploadStore } from "@/stores/upload-store"
import { useExplorerStore } from "@/stores/explorer-store"
import { UploadDropZone } from "@/components/features/upload-drop-zone"
import { UploadQueue } from "@/components/features/upload-queue"
import { FileList } from "@/components/features/file-list"
import { FileGrid } from "@/components/features/file-grid"
import { Breadcrumbs } from "@/components/features/breadcrumbs"
import { ShareModal } from "@/components/features/share-modal"
import { BatchShareDialog } from "@/components/features/batch-share-dialog"
import { FilePreview } from "@/components/features/file-preview"
import { SelectionMarquee } from "@/components/features/selection-marquee"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { MoveItemsDialog } from "@/components/shared/move-items-dialog"
import { TextInputDialog } from "@/components/shared/text-input-dialog"
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
import { StyledSelect } from "@/components/shared/styled-select"
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import type { WorkspaceRole } from "@bucketdrive/shared"
import { downloadZip } from "client-zip"
import { DEFAULT_BRAND_NAME } from "@/lib/branding"

interface WindowWithFilePicker extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{ description?: string; accept: Record<string, string[]> }>
  }) => Promise<{
    createWritable: () => Promise<WritableStream>
  }>
}

const typeFilterOptions = [
  { value: "all", label: "All files" },
  { value: "documents", label: "Documents" },
  { value: "images", label: "Images" },
  { value: "videos", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "archives", label: "Archives" },
] as const

const defaultDashboardSortOptions: Array<{ value: SearchSort; label: string }> = [
  { value: "name", label: "Name" },
  { value: "created_at", label: "Date" },
  { value: "size", label: "Size" },
  { value: "type", label: "Type" },
]

const workspaceRoles: readonly WorkspaceRole[] = [
  "owner",
  "admin",
  "manager",
  "editor",
  "viewer",
  "guest",
]

interface DeleteSelectionConfirm {
  count: number
  fileIds: string[]
  folderIds: string[]
}

type TextAction =
  | { type: "create-folder"; parentFolderId: string | null }
  | { type: "rename"; itemId: string; itemType: "file" | "folder"; currentName: string }

type MoveAction =
  | { type: "selected"; count: number; fileIds: string[]; folderIds: string[] }
  | {
      type: "item"
      itemId: string
      itemType: "file" | "folder"
      originalFolderId: string | null
    }

type BatchDownloadStatus = "idle" | "preparing" | "downloading" | "zipping" | "failed"
type BatchDownloadUrlFile = {
  id: string
  name?: string
  fileName?: string
  path: string
  sizeBytes?: number
}

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
  const [batchTagDialogOpen, setBatchTagDialogOpen] = useState(false)
  const [batchShareDialogOpen, setBatchShareDialogOpen] = useState(false)
  const [batchDownloadStatus, setBatchDownloadStatus] = useState<BatchDownloadStatus>("idle")
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [deleteSelectionConfirm, setDeleteSelectionConfirm] =
    useState<DeleteSelectionConfirm | null>(null)
  const [textAction, setTextAction] = useState<TextAction | null>(null)
  const [moveAction, setMoveAction] = useState<MoveAction | null>(null)
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

    setDeleteSelectionConfirm({
      count: totalCount,
      fileIds: selectedFileIds,
      folderIds: selectedFolderIds,
    })
  }, [selectedFileIds, selectedFolderIds, canDeleteFile, canDeleteFolder])

  const handleConfirmDeleteSelected = useCallback(() => {
    if (!deleteSelectionConfirm) return
    batchTrash.mutate(
      {
        files: deleteSelectionConfirm.fileIds,
        folders: deleteSelectionConfirm.folderIds,
      },
      {
        onSuccess: () => {
          clearSelection()
          setDeleteSelectionConfirm(null)
        },
      },
    )
  }, [batchTrash, clearSelection, deleteSelectionConfirm])

  const handleMoveSelected = useCallback(() => {
    const totalCount = selectedFileIds.length + selectedFolderIds.length
    if (totalCount === 0) return
    if (
      (selectedFileIds.length > 0 && !canMoveFile) ||
      (selectedFolderIds.length > 0 && !canMoveFolder)
    ) {
      return
    }

    setMoveAction({
      type: "selected",
      count: totalCount,
      fileIds: selectedFileIds,
      folderIds: selectedFolderIds,
    })
  }, [selectedFileIds, selectedFolderIds, canMoveFile, canMoveFolder])

  const handleCopySelected = useCallback(() => {
    const totalCount = selectedFileIds.length + selectedFolderIds.length
    if (totalCount === 0) return
    useExplorerStore.getState().setClipboard({
      action: "copy",
      fileIds: selectedFileIds,
      folderIds: selectedFolderIds,
    })
  }, [selectedFileIds, selectedFolderIds])

  const handleDownloadSelected = useCallback(async () => {
    const totalCount = selectedFileIds.length + selectedFolderIds.length
    if (totalCount === 0 || batchDownloadStatus !== "idle") return

    if (selectedFileIds.length === 1 && selectedFolderIds.length === 0) {
      const fileId = selectedFileIds[0]
      if (fileId) handleContextDownload(fileId)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 10 * 60 * 1000)

    setBatchDownloadStatus("preparing")
    setDownloadError(null)
    try {
      const res = await fetch("/api/batch/download-urls?manifestOnly=1", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: selectedFileIds, folders: selectedFolderIds }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          message?: string
          failed?: Array<{ code: string; message: string }>
        } | null
        const firstFailure = data?.failed?.[0]
        throw new Error(
          firstFailure
            ? `${firstFailure.message} (${firstFailure.code})`
            : (data?.message ?? "Batch download failed"),
        )
      }

      const data = (await res.json()) as { files?: BatchDownloadUrlFile[] }
      const files = data.files ?? []
      if (files.length === 0) throw new Error("No downloadable files found")

      setBatchDownloadStatus("zipping")
      const filename = `bucketdrive-selection-${new Date().toISOString().slice(0, 10)}.zip`
      async function* zipEntries() {
        for (const file of files) {
          const fileResponse = await fetch(`/api/files/${encodeURIComponent(file.id)}/content`, {
            credentials: "include",
            signal: controller.signal,
          })
          if (!fileResponse.ok) {
            throw new Error(file.fileName ?? file.name ?? file.path)
          }
          if (typeof file.sizeBytes === "number") {
            yield { name: file.path, size: file.sizeBytes, input: fileResponse }
          } else {
            yield { name: file.path, input: fileResponse }
          }
        }
      }
      const zipResponse = downloadZip(zipEntries(), { buffersAreUTF8: true })
      const win = window as unknown as WindowWithFilePicker
      if (win.showSaveFilePicker && zipResponse.body) {
        const handle = await win.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
        })
        const writable = await handle.createWritable()
        await zipResponse.body.pipeTo(writable)
      } else {
        setBatchDownloadStatus("downloading")
        const blob = await zipResponse.blob()
        if (blob.size === 0) {
          throw new Error("Batch download returned an empty ZIP")
        }

        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = filename
        document.body.append(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      setBatchDownloadStatus("failed")
      setDownloadError(
        error instanceof DOMException && error.name === "AbortError"
          ? "Batch download timed out"
          : error instanceof Error
            ? error.message
            : "Batch download failed",
      )
    } finally {
      window.clearTimeout(timeoutId)
      setBatchDownloadStatus("idle")
    }
  }, [batchDownloadStatus, handleContextDownload, selectedFileIds, selectedFolderIds])

  const handleShareSelected = useCallback(() => {
    const totalCount = selectedFileIds.length + selectedFolderIds.length
    if (totalCount === 0) return
    if (
      (selectedFileIds.length > 0 && !canShareFile) ||
      (selectedFolderIds.length > 0 && !canShareFolder)
    ) {
      return
    }
    setBatchShareDialogOpen(true)
  }, [selectedFileIds, selectedFolderIds, canShareFile, canShareFolder])

  const handleFavoriteSelected = useCallback(() => {
    if (!canFavorite || selectedFileIds.length === 0) return
    const selectedFiles = files.filter((file) => selectedFileIds.includes(file.id))
    for (const file of selectedFiles) {
      if (!file.isFavorited) {
        toggleFavoriteMutation.mutate({ fileId: file.id })
      }
    }
  }, [canFavorite, files, selectedFileIds, toggleFavoriteMutation])

  const handleTagsSelected = useCallback(() => {
    if (!canTag || selectedFileIds.length === 0) return
    setBatchTagDialogOpen(true)
  }, [canTag, selectedFileIds])

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
      setTextAction({ type: "rename", itemId: id, itemType: type, currentName })
    },
    [files, folders, canRenameFile, canRenameFolder],
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
    setTextAction({ type: "create-folder", parentFolderId: currentFolderId })
  }

  const handleContextMove = useCallback(
    (id: string, type: "file" | "folder") => {
      if ((type === "file" && !canMoveFile) || (type === "folder" && !canMoveFolder)) return
      const item =
        type === "file"
          ? files.find((candidate) => candidate.id === id)
          : folders.find((f) => f.id === id)
      const originalFolderId =
        item && type === "file"
          ? "folderId" in item
            ? item.folderId
            : currentFolderId
          : item && "parentFolderId" in item
            ? item.parentFolderId
            : currentFolderId
      setMoveAction({
        type: "item",
        itemId: id,
        itemType: type,
        originalFolderId,
      })
    },
    [files, folders, currentFolderId, canMoveFile, canMoveFolder],
  )

  const handleConfirmMove = useCallback(
    (targetFolderId: string | null) => {
      if (!moveAction) return
      if (moveAction.type === "selected") {
        batchMove.mutate(
          {
            files: moveAction.fileIds,
            folders: moveAction.folderIds,
            targetFolderId,
          },
          {
            onSuccess: () => {
              clearSelection()
              setMoveAction(null)
            },
          },
        )
        return
      }

      if (moveAction.itemType === "file") {
        void undoable.moveFile(moveAction.itemId, targetFolderId, moveAction.originalFolderId)
      } else {
        void undoable.moveFolder(moveAction.itemId, targetFolderId, moveAction.originalFolderId)
      }
      clearSelection()
      setMoveAction(null)
    },
    [batchMove, clearSelection, moveAction, undoable],
  )

  const handleSubmitTextAction = useCallback(
    (value: string) => {
      if (!textAction) return
      if (textAction.type === "create-folder") {
        createFolderMutation.mutate(
          {
            name: value,
            parentFolderId: textAction.parentFolderId,
          },
          { onSuccess: () => setTextAction(null) },
        )
        return
      }

      if (value === textAction.currentName) {
        setTextAction(null)
        return
      }

      if (textAction.itemType === "file") {
        void undoable.renameFile(textAction.itemId, value, textAction.currentName)
      } else {
        void undoable.renameFolder(textAction.itemId, value, textAction.currentName)
      }
      setTextAction(null)
    },
    [createFolderMutation, textAction, undoable],
  )

  const handleCreateMoveFolder = useCallback(
    async (name: string, parentFolderId: string | null) => {
      const folder = await createFolderMutation.mutateAsync({ name, parentFolderId })
      return { id: folder.id, name: folder.name }
    },
    [createFolderMutation],
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
  const isSingleFileSelection = selectedFileIds.length === 1 && selectedFolderIds.length === 0
  const canDeleteSelected =
    totalSelected > 0 &&
    (selectedFileIds.length === 0 || canDeleteFile) &&
    (selectedFolderIds.length === 0 || canDeleteFolder)
  const totalFiles = isSearchActive ? (searchData?.meta.total ?? 0) : (filesData?.meta?.total ?? 0)
  const selectedTagNames = allTags.filter((tag) => dashboardSearch.selectedTagIds.includes(tag.id))
  const dashboardSortOptions: Array<{ value: SearchSort; label: string }> = debouncedQuery
    ? [{ value: "relevance", label: "Relevance" }, ...defaultDashboardSortOptions]
    : defaultDashboardSortOptions
  const fileForTagDialog = files.find((file) => file.id === tagDialogFileId) ?? null
  const selectedFilesForBatch = files.filter((file) => selectedFileIds.includes(file.id))
  const selectedFoldersForBatch = folders.filter((folder) => selectedFolderIds.includes(folder.id))
  const selectedItemsForShare = [
    ...selectedFoldersForBatch.map((folder) => ({
      id: folder.id,
      type: "folder" as const,
      name: folder.name,
    })),
    ...selectedFilesForBatch.map((file) => ({
      id: file.id,
      type: "file" as const,
      name: file.originalName,
    })),
  ]
  const canShareSelected =
    totalSelected > 0 &&
    (selectedFileIds.length === 0 || canShareFile) &&
    (selectedFolderIds.length === 0 || canShareFolder)
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
    if (event.pointerType !== "mouse") return
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
        className="flex h-full min-w-0 flex-col p-4 sm:p-6"
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

        <PageToolbar>
          {totalSelected === 0 ? (
            <div className="grid w-full min-w-0 gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
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
              <div className="flex min-w-0 [scrollbar-width:none] gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
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
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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
                    <StyledSelect
                      value={dashboardSearch.sort}
                      onValueChange={setDashboardSort}
                      options={dashboardSortOptions}
                      triggerClassName="bg-surface-secondary rounded-full py-1.5 text-xs"
                      contentClassName="min-w-[140px]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDashboardOrder(dashboardSearch.order === "asc" ? "desc" : "asc")
                      }
                      className="bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                    >
                      {dashboardSearch.order === "asc" ? "Ascending" : "Descending"}
                    </button>
                    <button
                      type="button"
                      onClick={clearDashboardSearch}
                      className="bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      Clear search
                    </button>
                  </>
                )}
              </div>

              {allTags.length > 0 && (
                <div className="col-span-full hidden min-w-0 [scrollbar-width:none] items-center gap-2 overflow-x-auto xl:flex [&::-webkit-scrollbar]:hidden">
                  <span className="text-text-tertiary shrink-0 text-xs font-medium tracking-wide uppercase">
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
                <div className="col-span-full hidden min-w-0 [scrollbar-width:none] gap-2 overflow-x-auto 2xl:flex [&::-webkit-scrollbar]:hidden">
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
          ) : (
            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-text-primary shrink-0 text-sm font-medium">
                {totalSelected} item{totalSelected === 1 ? "" : "s"} selected
              </span>
              <div className="hidden flex-1 sm:block" />
              <div className="flex min-w-0 [scrollbar-width:none] items-center gap-2 overflow-x-auto sm:flex-wrap sm:justify-end [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={handleCopySelected}
                  className="text-text-secondary hover:bg-surface-hover hover:text-text-primary inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy selected
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDownloadSelected()
                  }}
                  disabled={batchDownloadStatus !== "idle"}
                  className="text-text-secondary hover:bg-surface-hover hover:text-text-primary inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {batchDownloadStatus === "preparing"
                    ? "Preparing..."
                    : batchDownloadStatus === "downloading"
                      ? "Downloading..."
                      : batchDownloadStatus === "zipping"
                        ? "Zipping..."
                        : batchDownloadStatus === "failed"
                          ? "Failed"
                          : isSingleFileSelection
                            ? "Download"
                            : "Download ZIP"}
                </button>
                {canShareSelected && (
                  <button
                    type="button"
                    onClick={handleShareSelected}
                    className="text-text-secondary hover:bg-surface-hover hover:text-text-primary inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Share selected
                  </button>
                )}
                {canFavorite && selectedFileIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleFavoriteSelected}
                    className="text-text-secondary hover:bg-surface-hover hover:text-text-primary inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
                  >
                    <Star className="h-3.5 w-3.5" />
                    Favorite files
                  </button>
                )}
                {canTag && selectedFileIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleTagsSelected}
                    className="text-text-secondary hover:bg-surface-hover hover:text-text-primary inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
                  >
                    <Tags className="h-3.5 w-3.5" />
                    Tags
                  </button>
                )}
                {(canMoveFile || canMoveFolder) && (
                  <button
                    type="button"
                    onClick={handleMoveSelected}
                    className="text-text-secondary hover:bg-surface-hover hover:text-text-primary inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Move selected
                  </button>
                )}
                {canDeleteSelected && (
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="text-error hover:bg-error/10 inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete selected
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => clearSelection()}
                  className="text-text-tertiary hover:bg-surface-hover hover:text-text-primary inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
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

      <TagPickerDialog
        open={batchTagDialogOpen}
        onOpenChange={(open) => {
          setBatchTagDialogOpen(open)
        }}
        workspaceId={workspaceId}
        files={selectedFilesForBatch}
        canManageTags={canTag}
      />

      <BatchShareDialog
        open={batchShareDialogOpen}
        onOpenChange={setBatchShareDialogOpen}
        workspaceId={workspaceId ?? ""}
        items={selectedItemsForShare}
      />

      <ConfirmDialog
        open={deleteSelectionConfirm !== null}
        title={deleteSelectionConfirm?.count === 1 ? "Delete this item?" : "Delete selected items?"}
        description={
          deleteSelectionConfirm
            ? deleteSelectionConfirm.count === 1
              ? "This item will be moved to trash."
              : `${String(deleteSelectionConfirm.count)} items will be moved to trash.`
            : undefined
        }
        confirmLabel="Move to trash"
        loadingLabel="Moving..."
        loading={batchTrash.isPending}
        onConfirm={handleConfirmDeleteSelected}
        onOpenChange={(open) => {
          if (!open) setDeleteSelectionConfirm(null)
        }}
      />

      <TextInputDialog
        open={textAction !== null}
        title={textAction?.type === "create-folder" ? "New folder" : "Rename item"}
        description={
          textAction?.type === "create-folder"
            ? "Create a folder in the current location."
            : "Enter a new name for this item."
        }
        label={textAction?.type === "create-folder" ? "Folder name" : "Name"}
        initialValue={textAction?.type === "rename" ? textAction.currentName : ""}
        placeholder={textAction?.type === "create-folder" ? "Folder name" : undefined}
        confirmLabel={textAction?.type === "create-folder" ? "Create folder" : "Rename"}
        loadingLabel={textAction?.type === "create-folder" ? "Creating..." : "Renaming..."}
        loading={textAction?.type === "create-folder" && createFolderMutation.isPending}
        error={
          textAction?.type === "create-folder" && createFolderMutation.isError
            ? createFolderMutation.error.message
            : undefined
        }
        onSubmit={handleSubmitTextAction}
        onOpenChange={(open) => {
          if (!open) setTextAction(null)
        }}
      />

      <MoveItemsDialog
        open={moveAction !== null}
        workspaceId={workspaceId}
        title="Move items"
        description={
          moveAction?.type === "selected"
            ? `Choose a destination for ${String(moveAction.count)} selected item${moveAction.count === 1 ? "" : "s"}.`
            : "Choose a destination folder."
        }
        initialFolderId={currentFolderId}
        excludedFolderIds={
          moveAction?.type === "selected"
            ? moveAction.folderIds
            : moveAction?.itemType === "folder"
              ? [moveAction.itemId]
              : []
        }
        loading={batchMove.isPending}
        createLoading={createFolderMutation.isPending}
        error={batchMove.isError ? batchMove.error.message : undefined}
        createError={createFolderMutation.isError ? createFolderMutation.error.message : undefined}
        onConfirm={handleConfirmMove}
        onCreateFolder={handleCreateMoveFolder}
        onOpenChange={(open) => {
          if (!open) setMoveAction(null)
        }}
      />
    </>
  )
}
