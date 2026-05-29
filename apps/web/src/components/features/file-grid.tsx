/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { useRef, useEffect, useState, useMemo, useCallback } from "react"
import { Folder, FolderOpen, GripVertical, Star } from "lucide-react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { FileObject, Folder as FolderType } from "@bucketdrive/shared"
import { FileContextMenu } from "./file-context-menu"
import { FileThumbnail } from "./file-thumbnail"
import { getTagColorClasses } from "@/lib/tag-colors"
import { useExplorerStore } from "@/stores/explorer-store"

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const unit = units[i] ?? "GB"
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${unit}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${String(days)} days ago`
  return date.toLocaleDateString()
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return "\uD83D\uDDBC"
  if (mimeType.startsWith("video/")) return "\uD83C\uDFAC"
  if (mimeType.startsWith("audio/")) return "\uD83C\uDFB5"
  if (mimeType.includes("pdf")) return "\uD83D\uDCC4"
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "\uD83D\uDCCA"
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "\uD83D\uDCBD"
  if (mimeType.startsWith("text/")) return "\uD83D\uDCDD"
  return "\uD83D\uDCC1"
}

function renderTagPreview(file: FileObject) {
  const tags = file.tags ?? []
  if (tags.length === 0) return null

  const visible = tags.slice(0, 2)
  const hiddenCount = tags.length - visible.length

  return (
    <div className="mt-2 flex flex-wrap justify-center gap-1">
      {visible.map((tag) => (
        <span
          key={tag.id}
          className={[
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            getTagColorClasses(tag.color).chipClassName,
          ].join(" ")}
        >
          {tag.name}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] text-text-secondary">
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}

const gridClass =
  "group flex cursor-pointer flex-col items-center rounded-xl border bg-surface-default p-4 text-center transition-colors hover:border-border-default hover:bg-surface-hover focus:outline-none"

const ROW_HEIGHT = 172

function getGridCols(width: number): number {
  if (width >= 1280) return 6
  if (width >= 1024) return 5
  if (width >= 768) return 4
  if (width >= 640) return 3
  return 2
}

interface FolderGridCardProps {
  folder: FolderType
  index: number
  isSelected: boolean
  isFocused: boolean
  onFolderClick: (folderId: string) => void
  onItemClick: (id: string, type: "file" | "folder", index: number, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void
  onContextOpen?: (_id: string, _type: "file" | "folder") => void
  onContextRename?: (id: string, type: "file" | "folder") => void
  onContextDelete?: (id: string, type: "file" | "folder") => void
  onContextMove?: (id: string, type: "file" | "folder") => void
  onContextShare?: (id: string, type: "file" | "folder") => void
  dndEnabled: boolean
}

function FolderGridCard({
  folder,
  index,
  isSelected,
  isFocused,
  onFolderClick,
  onItemClick,
  onContextOpen: _onContextOpen,
  onContextRename,
  onContextDelete,
  onContextMove,
  onContextShare,
  dndEnabled,
}: FolderGridCardProps) {
  const dragId = `folder-${folder.id}`
  const droppable = useDroppable({ id: dragId, disabled: !dndEnabled })
  const draggable = useDraggable({ id: dragId, disabled: !dndEnabled })

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      draggable.setNodeRef(node)
      droppable.setNodeRef(node)
    },
    [draggable, droppable],
  )
  const setClipboard = useExplorerStore((state) => state.setClipboard)

  const isDragging = draggable.isDragging
  const isOver = droppable.isOver

  return (
    <FileContextMenu
      key={folder.id}
      itemId={folder.id}
      itemType="folder"
      onOpen={() => onFolderClick(folder.id)}
      onRename={() => onContextRename?.(folder.id, "folder")}
      onDelete={() => onContextDelete?.(folder.id, "folder")}
      onMove={() => onContextMove?.(folder.id, "folder")}
      onShare={() => onContextShare?.(folder.id, "folder")}
      onCopy={() => {
        setClipboard({
          action: "copy",
          fileIds: [],
          folderIds: [folder.id],
        })
      }}
    >
      <div
        ref={setRefs}
        data-item-id={folder.id}
        data-item-type="folder"
        data-item-index={index}
        onClick={(e) => {
          if (!dndEnabled || !isDragging) onItemClick(folder.id, "folder", index, e)
        }}
        onDoubleClick={() => onFolderClick(folder.id)}
        className={`relative ${gridClass} ${
          isDragging
            ? "opacity-50"
            : isOver
              ? "border-accent bg-accent/10"
              : isSelected
                ? "border-accent bg-accent/10 ring-1 ring-accent"
                : isFocused
                  ? "border-border-default ring-1 ring-border-muted"
                  : "border-border-muted"
        }`}
      >
        {dndEnabled && (
          <button
            type="button"
            aria-label="Drag folder"
            className="absolute right-2 top-2 rounded p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-surface-default hover:text-text-primary group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
            {...draggable.attributes}
            {...draggable.listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-hover text-text-tertiary group-hover:text-accent">
          <FolderOpen className="h-7 w-7" />
        </div>
        <span className="mb-0.5 line-clamp-2 w-full break-words text-xs font-medium text-text-primary">
          {folder.name}
        </span>
        <span className="text-[10px] text-text-tertiary">Folder</span>
      </div>
    </FileContextMenu>
  )
}

interface FileGridCardProps {
  file: FileObject
  index: number
  workspaceId: string
  isSelected: boolean
  isFocused: boolean
  onItemClick: (id: string, type: "file" | "folder", index: number, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void
  onContextOpen?: (id: string, type: "file" | "folder") => void
  onContextPreview?: (id: string) => void
  onContextDownload?: (id: string) => void
  onContextRename?: (id: string, type: "file" | "folder") => void
  onContextDelete?: (id: string, type: "file" | "folder") => void
  onContextFavorite?: (id: string) => void
  onContextTags?: (id: string) => void
  onContextMove?: (id: string, type: "file" | "folder") => void
  onContextShare?: (id: string, type: "file" | "folder") => void
  dndEnabled: boolean
}

function FileGridCard({
  file,
  index,
  workspaceId,
  isSelected,
  isFocused,
  onItemClick,
  onContextOpen,
  onContextPreview,
  onContextDownload,
  onContextRename,
  onContextDelete,
  onContextFavorite,
  onContextTags,
  onContextMove,
  onContextShare,
  dndEnabled,
}: FileGridCardProps) {
  const dragId = `file-${file.id}`
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: dragId,
    disabled: !dndEnabled,
  })
  const setClipboard = useExplorerStore((state) => state.setClipboard)

  return (
    <FileContextMenu
      key={file.id}
      itemId={file.id}
      itemType="file"
      onOpen={() => onContextOpen?.(file.id, "file")}
      onPreview={() => onContextPreview?.(file.id)}
      onDownload={() => onContextDownload?.(file.id)}
      onRename={() => onContextRename?.(file.id, "file")}
      onDelete={() => onContextDelete?.(file.id, "file")}
      onFavorite={() => onContextFavorite?.(file.id)}
      favoriteLabel={file.isFavorited ? "Remove favorite" : "Add favorite"}
      onTags={() => onContextTags?.(file.id)}
      onMove={() => onContextMove?.(file.id, "file")}
      onShare={() => onContextShare?.(file.id, "file")}
      onCopy={() => {
        setClipboard({
          action: "copy",
          fileIds: [file.id],
          folderIds: [],
        })
      }}
    >
      <div
        ref={setNodeRef}
        data-item-id={file.id}
        data-item-type="file"
        data-item-index={index}
        onClick={(e) => {
          if (!dndEnabled || !isDragging) onItemClick(file.id, "file", index, e)
        }}
        onDoubleClick={() => onContextPreview?.(file.id)}
        className={`relative ${gridClass} ${
          isDragging
            ? "opacity-50"
            : isSelected
              ? "border-accent bg-accent/10 ring-1 ring-accent"
              : isFocused
                ? "border-border-default ring-1 ring-border-muted"
                : "border-border-muted"
        }`}
      >
        {dndEnabled && (
          <button
            type="button"
            aria-label="Drag file"
            className="absolute right-2 top-2 rounded p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-surface-default hover:text-text-primary group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="mb-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-surface-hover text-2xl">
          <FileThumbnail
            workspaceId={workspaceId}
            fileId={file.id}
            mimeType={file.mimeType}
            fallback={getFileIcon(file.mimeType)}
            className="h-full w-full"
          />
        </div>
        <div className="mb-0.5 flex w-full items-center justify-center gap-1">
          <span className="line-clamp-2 break-words text-xs font-medium text-text-primary">
            {file.originalName}
          </span>
          {file.isFavorited && <Star className="h-3.5 w-3.5 fill-warning text-warning" />}
        </div>
        <span className="text-[10px] text-text-tertiary">
          {formatSize(file.sizeBytes)} &middot; {formatDate(file.updatedAt)}
        </span>
        {renderTagPreview(file)}
      </div>
    </FileContextMenu>
  )
}

interface FileGridProps {
  workspaceId: string
  folders: FolderType[]
  files: FileObject[]
  isLoading: boolean
  onFolderClick: (folderId: string) => void
  onItemClick: (id: string, type: "file" | "folder", index: number, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void
  onContextOpen?: (id: string, type: "file" | "folder") => void
  onContextPreview?: (id: string) => void
  onContextDownload?: (id: string) => void
  onContextRename?: (id: string, type: "file" | "folder") => void
  onContextDelete?: (id: string, type: "file" | "folder") => void
  onContextFavorite?: (id: string) => void
  onContextTags?: (id: string) => void
  onContextMove?: (id: string, type: "file" | "folder") => void
  onContextShare?: (id: string, type: "file" | "folder") => void
  onItemDrop?: (sourceId: string, sourceType: "file" | "folder", targetFolderId: string) => void
}

export function FileGrid({
  workspaceId,
  folders,
  files,
  isLoading,
  onFolderClick,
  onItemClick,
  onContextOpen,
  onContextPreview,
  onContextDownload,
  onContextRename,
  onContextDelete,
  onContextFavorite,
  onContextTags,
  onContextMove,
  onContextShare,
  onItemDrop,
}: FileGridProps) {
  const selectedFileIds = useExplorerStore((s) => s.selectedFileIds)
  const selectedFolderIds = useExplorerStore((s) => s.selectedFolderIds)
  const focusedItemId = useExplorerStore((s) => s.focusedItemId)
  const dndEnabled = !!onItemDrop

  const parentRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(2)

  useEffect(() => {
    const el = parentRef.current
    if (!el) return

    const updateCols = () => {
      setCols(getGridCols(el.clientWidth))
    }

    updateCols()

    const observer = new ResizeObserver(updateCols)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const allItems = useMemo(
    () => [
      ...folders.map((f) => ({ type: "folder" as const, data: f })),
      ...files.map((f) => ({ type: "file" as const, data: f })),
    ],
    [folders, files],
  )

  const rowCount = useMemo(
    () => Math.ceil(allItems.length / cols),
    [allItems.length, cols],
  )

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 2,
    lanes: cols,
  })

  const focusedIndex = useMemo(
    () => allItems.findIndex((item) => item.data.id === focusedItemId),
    [allItems, focusedItemId],
  )

  useEffect(() => {
    if (focusedIndex >= 0) {
      const rowIndex = Math.floor(focusedIndex / cols)
      virtualizer.scrollToIndex(rowIndex, { align: "center" })
    }
  }, [focusedIndex, cols, virtualizer])

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-border-muted bg-surface-default p-4">
            <div className="mx-auto mb-3 h-12 w-12 rounded-lg bg-surface-hover" />
            <div className="mx-auto mb-2 h-3 w-20 rounded bg-surface-hover" />
            <div className="mx-auto h-2.5 w-14 rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    )
  }

  if (folders.length === 0 && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <Folder className="h-12 w-12 text-text-tertiary" />
        <p className="text-sm text-text-tertiary">No files yet — drag files here to upload</p>
      </div>
    )
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div ref={parentRef} className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
      <div
        style={{
          height: `${String(virtualizer.getTotalSize())}px`,
          position: "relative",
          width: "100%",
        }}
      >
        {virtualItems.map((virtualItem) => {
          const rowIndex = virtualItem.index
          const startIndex = rowIndex * cols

          return (
            <div
              key={rowIndex}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${String(virtualItem.start)}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${String(cols)}, minmax(0, 1fr))`,
                gap: "0.75rem",
              }}
            >
              {Array.from({ length: cols }).map((_, colIndex) => {
                const itemIndex = startIndex + colIndex
                const item = allItems[itemIndex]
                if (!item) return <div key={`empty-${String(colIndex)}`} />

                if (item.type === "folder") {
                  const folder = item.data
                  return (
                    <FolderGridCard
                      key={folder.id}
                      folder={folder}
                      index={itemIndex}
                      isSelected={selectedFolderIds.includes(folder.id)}
                      isFocused={focusedItemId === folder.id}
                      onFolderClick={onFolderClick}
                      onItemClick={onItemClick}
                      onContextOpen={onContextOpen}
                      onContextRename={onContextRename}
                      onContextDelete={onContextDelete}
                      onContextMove={onContextMove}
                      onContextShare={onContextShare}
                      dndEnabled={dndEnabled}
                    />
                  )
                }

                const file = item.data
                return (
                  <FileGridCard
                    key={file.id}
                    file={file}
                    index={itemIndex}
                    workspaceId={workspaceId}
                    isSelected={selectedFileIds.includes(file.id)}
                    isFocused={focusedItemId === file.id}
                    onItemClick={onItemClick}
                    onContextOpen={onContextOpen}
                    onContextPreview={onContextPreview}
                    onContextDownload={onContextDownload}
                    onContextRename={onContextRename}
                    onContextDelete={onContextDelete}
                    onContextFavorite={onContextFavorite}
                    onContextTags={onContextTags}
                    onContextMove={onContextMove}
                    onContextShare={onContextShare}
                    dndEnabled={dndEnabled}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
