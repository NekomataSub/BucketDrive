/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { useMemo, useCallback, type PointerEvent } from "react"
import { Folder, FolderOpen, GripVertical, Star } from "lucide-react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
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
        <span className="bg-surface-hover text-text-secondary rounded-full px-2 py-0.5 text-[10px]">
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}

const gridClass =
  "group flex h-full min-h-36 cursor-pointer flex-col items-center rounded-xl border bg-surface-default p-4 text-center transition-colors focus:outline-none"

function getGridCardStateClass({
  isDragging,
  isOver = false,
  isSelected,
  isFocused,
}: {
  isDragging: boolean
  isOver?: boolean
  isSelected: boolean
  isFocused: boolean
}) {
  if (isDragging) return "border-border-muted opacity-50"
  if (isOver) return "border-accent bg-accent/10"
  if (isSelected) return "border-accent bg-accent/10"
  if (isFocused) return "border-border-default bg-surface-default"
  return "border-border-muted hover:border-border-default hover:bg-surface-hover"
}

interface FolderGridCardProps {
  folder: FolderType
  index: number
  isSelected: boolean
  isFocused: boolean
  onFolderClick: (folderId: string) => void
  onItemClick: (
    id: string,
    type: "file" | "folder",
    index: number,
    event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void
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
  const droppable = useDroppable({
    id: dragId,
    disabled: !dndEnabled,
    data: { type: "folder", id: folder.id },
  })
  const draggable = useDraggable({
    id: dragId,
    disabled: !dndEnabled,
    data: { type: "folder", id: folder.id },
  })

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
      onRename={onContextRename ? () => onContextRename(folder.id, "folder") : undefined}
      onDelete={onContextDelete ? () => onContextDelete(folder.id, "folder") : undefined}
      onMove={onContextMove ? () => onContextMove(folder.id, "folder") : undefined}
      onShare={onContextShare ? () => onContextShare(folder.id, "folder") : undefined}
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
        data-selectable-item
        data-item-id={folder.id}
        data-item-type="folder"
        data-item-index={index}
        onClick={(e) => {
          if (dndEnabled && isDragging) return
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            onItemClick(folder.id, "folder", index, e)
            return
          }
          onFolderClick(folder.id)
        }}
        className={`relative ${gridClass} ${getGridCardStateClass({
          isDragging,
          isOver,
          isSelected,
          isFocused,
        })}`}
      >
        {dndEnabled && (
          <button
            type="button"
            aria-label="Drag folder"
            className="text-text-tertiary hover:bg-surface-default hover:text-text-primary absolute top-2 right-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
            {...draggable.attributes}
            {...draggable.listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="bg-surface-hover text-text-tertiary group-hover:text-accent mb-3 flex h-12 w-12 items-center justify-center rounded-lg">
          <FolderOpen className="h-7 w-7" />
        </div>
        <span className="text-text-primary mb-0.5 line-clamp-2 w-full text-xs font-medium break-words">
          {folder.name}
        </span>
        <span className="text-text-tertiary text-[10px]">Folder</span>
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
  onItemClick: (
    id: string,
    type: "file" | "folder",
    index: number,
    event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void
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
    data: { type: "file", id: file.id },
  })
  const setClipboard = useExplorerStore((state) => state.setClipboard)

  return (
    <FileContextMenu
      key={file.id}
      itemId={file.id}
      itemType="file"
      onOpen={() => onContextOpen?.(file.id, "file")}
      onPreview={onContextPreview ? () => onContextPreview(file.id) : undefined}
      onDownload={onContextDownload ? () => onContextDownload(file.id) : undefined}
      onRename={onContextRename ? () => onContextRename(file.id, "file") : undefined}
      onDelete={onContextDelete ? () => onContextDelete(file.id, "file") : undefined}
      onFavorite={onContextFavorite ? () => onContextFavorite(file.id) : undefined}
      favoriteLabel={file.isFavorited ? "Remove favorite" : "Add favorite"}
      onTags={onContextTags ? () => onContextTags(file.id) : undefined}
      onMove={onContextMove ? () => onContextMove(file.id, "file") : undefined}
      onShare={onContextShare ? () => onContextShare(file.id, "file") : undefined}
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
        data-selectable-item
        data-item-id={file.id}
        data-item-type="file"
        data-item-index={index}
        data-testid="file-card"
        onClick={(e) => {
          if (dndEnabled && isDragging) return
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            onItemClick(file.id, "file", index, e)
            return
          }
          onContextPreview?.(file.id)
        }}
        className={`relative ${gridClass} ${getGridCardStateClass({
          isDragging,
          isSelected,
          isFocused,
        })}`}
      >
        {dndEnabled && (
          <button
            type="button"
            aria-label="Drag file"
            className="text-text-tertiary hover:bg-surface-default hover:text-text-primary absolute top-2 right-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="bg-surface-hover mb-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg text-2xl">
          <FileThumbnail
            workspaceId={workspaceId}
            fileId={file.id}
            mimeType={file.mimeType}
            thumbnailKey={file.thumbnailKey}
            fallback={getFileIcon(file.mimeType)}
            className="h-full w-full"
          />
        </div>
        <div className="mb-0.5 flex w-full items-center justify-center gap-1">
          <span className="text-text-primary line-clamp-2 text-xs font-medium break-words">
            {file.originalName}
          </span>
          {file.isFavorited && <Star className="fill-warning text-warning h-3.5 w-3.5" />}
        </div>
        <span className="text-text-tertiary text-[10px]">
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
  onItemClick: (
    id: string,
    type: "file" | "folder",
    index: number,
    event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void
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
  onSelectionPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  onSelectionPointerMove?: (event: PointerEvent<HTMLDivElement>) => void
  onSelectionPointerUp?: (event: PointerEvent<HTMLDivElement>) => void
  onSelectionPointerCancel?: (event: PointerEvent<HTMLDivElement>) => void
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
  onSelectionPointerDown,
  onSelectionPointerMove,
  onSelectionPointerUp,
  onSelectionPointerCancel,
}: FileGridProps) {
  const selectedFileIds = useExplorerStore((s) => s.selectedFileIds)
  const selectedFolderIds = useExplorerStore((s) => s.selectedFolderIds)
  const focusedItemId = useExplorerStore((s) => s.focusedItemId)
  const dndEnabled = !!onItemDrop

  const allItems = useMemo(
    () => [
      ...folders.map((f) => ({ type: "folder" as const, data: f })),
      ...files.map((f) => ({ type: "file" as const, data: f })),
    ],
    [folders, files],
  )

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="border-border-muted bg-surface-default animate-pulse rounded-xl border p-4"
          >
            <div className="bg-surface-hover mx-auto mb-3 h-12 w-12 rounded-lg" />
            <div className="bg-surface-hover mx-auto mb-2 h-3 w-20 rounded" />
            <div className="bg-surface-hover mx-auto h-2.5 w-14 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (folders.length === 0 && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <Folder className="text-text-tertiary h-12 w-12" />
        <p className="text-text-tertiary text-sm">No files yet — drag files here to upload</p>
      </div>
    )
  }

  return (
    <div
      className="max-h-[calc(100vh-320px)] min-h-[calc(100vh-420px)] overflow-auto"
      onPointerDown={onSelectionPointerDown}
      onPointerMove={onSelectionPointerMove}
      onPointerUp={onSelectionPointerUp}
      onPointerCancel={onSelectionPointerCancel}
    >
      <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {allItems.map((item, itemIndex) => {
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
    </div>
  )
}
