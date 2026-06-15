/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { useCallback, useMemo, useRef, type PointerEvent } from "react"
import { Folder, FolderOpen, GripVertical, MoreVertical, Star } from "lucide-react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import type { FileObject, Folder as FolderType } from "@bucketdrive/shared"
import { FileContextMenu } from "./file-context-menu"
import { FileThumbnail } from "./file-thumbnail"
import { getTagColorClasses } from "@/lib/tag-colors"
import { formatBytes, formatRelativeDate, getFileIcon } from "@/lib/format"
import { useExplorerStore } from "@/stores/explorer-store"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"

function renderTagPreview(file: FileObject) {
  const tags = file.tags ?? []
  if (tags.length === 0) return null

  const visible = tags.slice(0, 2)
  const hiddenCount = tags.length - visible.length

  return (
    <div className="mt-1 flex flex-wrap gap-1">
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

const dropdownItemClass =
  "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-primary outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-active data-[highlighted]:text-text-primary data-[disabled]:text-text-tertiary"

const rowClass =
  "flex min-h-14 items-center border-b border-border-muted transition-colors last:border-b-0 hover:bg-surface-hover focus:outline-none"

interface SelectionContextActions {
  downloadLabel: string
  onCopy?: () => void
  onDownload?: () => void
  onShare?: () => void
  onFavorite?: () => void
  onTags?: () => void
  onMove?: () => void
  onDelete?: () => void
}

function useMenuAction() {
  const lastActionAtRef = useRef(0)
  return useCallback((event: { stopPropagation: () => void }, action: () => void) => {
    event.stopPropagation()
    const now = Date.now()
    if (now - lastActionAtRef.current < 80) return
    lastActionAtRef.current = now
    window.setTimeout(action, 0)
  }, [])
}

function renderSelectionDropdownItems(
  selectionContextActions: SelectionContextActions | undefined,
  runMenuAction: (event: { stopPropagation: () => void }, action: () => void) => void,
) {
  const onCopy = selectionContextActions?.onCopy
  const onDownload = selectionContextActions?.onDownload
  const onFavorite = selectionContextActions?.onFavorite
  const onTags = selectionContextActions?.onTags
  const onMove = selectionContextActions?.onMove
  const onShare = selectionContextActions?.onShare
  const onDelete = selectionContextActions?.onDelete

  return (
    <>
      {onCopy && (
        <DropdownMenu.Item
          className={dropdownItemClass}
          onClick={(event) => runMenuAction(event, onCopy)}
          onSelect={(event) => runMenuAction(event, onCopy)}
        >
          Copy selected
        </DropdownMenu.Item>
      )}
      {onDownload && (
        <DropdownMenu.Item
          className={dropdownItemClass}
          onClick={(event) => runMenuAction(event, onDownload)}
          onSelect={(event) => runMenuAction(event, onDownload)}
        >
          {selectionContextActions.downloadLabel}
        </DropdownMenu.Item>
      )}
      {(onFavorite || onTags) && (
        <DropdownMenu.Separator className="bg-border-muted mx-2 my-1 h-px" />
      )}
      {onFavorite && (
        <DropdownMenu.Item
          className={dropdownItemClass}
          onClick={(event) => runMenuAction(event, onFavorite)}
          onSelect={(event) => runMenuAction(event, onFavorite)}
        >
          Favorite files
        </DropdownMenu.Item>
      )}
      {onTags && (
        <DropdownMenu.Item
          className={dropdownItemClass}
          onClick={(event) => runMenuAction(event, onTags)}
          onSelect={(event) => runMenuAction(event, onTags)}
        >
          Tags
        </DropdownMenu.Item>
      )}
      {(onMove || onShare) && <DropdownMenu.Separator className="bg-border-muted mx-2 my-1 h-px" />}
      {onMove && (
        <DropdownMenu.Item
          className={dropdownItemClass}
          onClick={(event) => runMenuAction(event, onMove)}
          onSelect={(event) => runMenuAction(event, onMove)}
        >
          Move selected
        </DropdownMenu.Item>
      )}
      {onShare && (
        <DropdownMenu.Item
          className={dropdownItemClass}
          onClick={(event) => runMenuAction(event, onShare)}
          onSelect={(event) => runMenuAction(event, onShare)}
        >
          Share selected
        </DropdownMenu.Item>
      )}
      {onDelete && <DropdownMenu.Separator className="bg-border-muted mx-2 my-1 h-px" />}
      {onDelete && (
        <DropdownMenu.Item
          className={dropdownItemClass}
          onClick={(event) => runMenuAction(event, onDelete)}
          onSelect={(event) => runMenuAction(event, onDelete)}
        >
          Delete selected
        </DropdownMenu.Item>
      )}
    </>
  )
}

interface FolderListRowProps {
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
  onContextRename?: (id: string, type: "file" | "folder") => void
  onContextDelete?: (id: string, type: "file" | "folder") => void
  onContextMove?: (id: string, type: "file" | "folder") => void
  onContextShare?: (id: string, type: "file" | "folder") => void
  selectedCount: number
  selectionContextActions?: SelectionContextActions
  dndEnabled: boolean
}

function FolderListRow({
  folder,
  index,
  isSelected,
  isFocused,
  onFolderClick,
  onItemClick,
  onContextRename,
  onContextDelete,
  onContextMove,
  onContextShare,
  selectedCount,
  selectionContextActions,
  dndEnabled,
}: FolderListRowProps) {
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
  const setClipboard = useExplorerStore((state) => state.setClipboard)
  const runMenuAction = useMenuAction()
  const useSelectionActions = isSelected && selectedCount > 1

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      draggable.setNodeRef(node)
      droppable.setNodeRef(node)
    },
    [draggable, droppable],
  )

  return (
    <FileContextMenu
      key={folder.id}
      itemId={folder.id}
      itemType="folder"
      scope={useSelectionActions ? "selection" : "item"}
      downloadLabel={useSelectionActions ? selectionContextActions?.downloadLabel : undefined}
      copyLabel={useSelectionActions ? "Copy selected" : undefined}
      moveLabel={useSelectionActions ? "Move selected" : undefined}
      shareLabel={useSelectionActions ? "Share selected" : undefined}
      deleteLabel={useSelectionActions ? "Delete selected" : undefined}
      favoriteLabel={useSelectionActions ? "Favorite files" : undefined}
      onOpen={useSelectionActions ? undefined : () => onFolderClick(folder.id)}
      onRename={
        !useSelectionActions && onContextRename
          ? () => onContextRename(folder.id, "folder")
          : undefined
      }
      onDelete={
        useSelectionActions
          ? selectionContextActions?.onDelete
          : onContextDelete
            ? () => onContextDelete(folder.id, "folder")
            : undefined
      }
      onMove={
        useSelectionActions
          ? selectionContextActions?.onMove
          : onContextMove
            ? () => onContextMove(folder.id, "folder")
            : undefined
      }
      onShare={
        useSelectionActions
          ? selectionContextActions?.onShare
          : onContextShare
            ? () => onContextShare(folder.id, "folder")
            : undefined
      }
      onFavorite={useSelectionActions ? selectionContextActions?.onFavorite : undefined}
      onTags={useSelectionActions ? selectionContextActions?.onTags : undefined}
      onDownload={useSelectionActions ? selectionContextActions?.onDownload : undefined}
      onCopy={
        useSelectionActions
          ? selectionContextActions?.onCopy
          : () => {
              setClipboard({
                action: "copy",
                fileIds: [],
                folderIds: [folder.id],
              })
            }
      }
    >
      <div
        ref={setRefs}
        data-selectable-item
        data-item-id={folder.id}
        data-item-type="folder"
        data-item-index={index}
        onClick={(e) => {
          if (dndEnabled && draggable.isDragging) return
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            onItemClick(folder.id, "folder", index, e)
            return
          }
          onFolderClick(folder.id)
        }}
        className={`${rowClass} ${
          draggable.isDragging
            ? "opacity-50"
            : droppable.isOver
              ? "bg-accent/10"
              : isSelected
                ? "bg-accent/10"
                : isFocused
                  ? "bg-surface-hover"
                  : ""
        }`}
      >
        <div className="flex flex-1 items-center gap-3 px-4 py-2.5">
          {dndEnabled && (
            <button
              type="button"
              aria-label="Drag folder"
              className="text-text-tertiary hover:bg-surface-default hover:text-text-primary rounded p-1 transition-colors"
              onClick={(e) => e.stopPropagation()}
              {...draggable.attributes}
              {...draggable.listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <FolderOpen className="text-text-tertiary h-5 w-5" />
          <span className="text-text-primary truncate text-sm font-medium">{folder.name}</span>
        </div>
        <div className="text-text-tertiary hidden w-24 px-4 py-2.5 text-sm md:block">—</div>
        <div className="text-text-tertiary hidden w-40 px-4 py-2.5 text-sm lg:block">—</div>
        <div className="text-text-tertiary hidden w-32 px-4 py-2.5 text-sm sm:block">
          {formatRelativeDate(folder.updatedAt)}
        </div>
        <div className="w-10 px-4 py-2.5">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="text-text-tertiary hover:bg-surface-default hover:text-text-primary rounded p-1 transition-colors"
                aria-label="More options"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="border-border-default bg-surface-default z-50 min-w-[160px] overflow-hidden rounded-lg border p-1.5 shadow-lg"
                side="bottom"
                align="end"
              >
                {useSelectionActions ? (
                  renderSelectionDropdownItems(selectionContextActions, runMenuAction)
                ) : (
                  <>
                    <DropdownMenu.Item
                      className={dropdownItemClass}
                      onClick={(event) => runMenuAction(event, () => onFolderClick(folder.id))}
                      onSelect={(event) => runMenuAction(event, () => onFolderClick(folder.id))}
                    >
                      Open
                    </DropdownMenu.Item>
                    {onContextRename && (
                      <DropdownMenu.Item
                        className={dropdownItemClass}
                        onClick={(event) =>
                          runMenuAction(event, () => onContextRename(folder.id, "folder"))
                        }
                        onSelect={(event) =>
                          runMenuAction(event, () => onContextRename(folder.id, "folder"))
                        }
                      >
                        Rename
                      </DropdownMenu.Item>
                    )}
                    {onContextMove && (
                      <DropdownMenu.Item
                        className={dropdownItemClass}
                        onClick={(event) =>
                          runMenuAction(event, () => onContextMove(folder.id, "folder"))
                        }
                        onSelect={(event) =>
                          runMenuAction(event, () => onContextMove(folder.id, "folder"))
                        }
                      >
                        Move
                      </DropdownMenu.Item>
                    )}
                    {onContextShare && (
                      <DropdownMenu.Separator className="bg-border-muted mx-2 my-1 h-px" />
                    )}
                    {onContextShare && (
                      <DropdownMenu.Item
                        className={dropdownItemClass}
                        onClick={(event) =>
                          runMenuAction(event, () => onContextShare(folder.id, "folder"))
                        }
                        onSelect={(event) =>
                          runMenuAction(event, () => onContextShare(folder.id, "folder"))
                        }
                      >
                        Share
                      </DropdownMenu.Item>
                    )}
                    {onContextDelete && (
                      <DropdownMenu.Separator className="bg-border-muted mx-2 my-1 h-px" />
                    )}
                    {onContextDelete && (
                      <DropdownMenu.Item
                        className={dropdownItemClass}
                        onClick={(event) =>
                          runMenuAction(event, () => onContextDelete(folder.id, "folder"))
                        }
                        onSelect={(event) =>
                          runMenuAction(event, () => onContextDelete(folder.id, "folder"))
                        }
                      >
                        Delete
                      </DropdownMenu.Item>
                    )}
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </FileContextMenu>
  )
}

interface FileListRowProps {
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
  onContextPreview?: (id: string) => void
  onContextDownload?: (id: string) => void
  onContextRename?: (id: string, type: "file" | "folder") => void
  onContextDelete?: (id: string, type: "file" | "folder") => void
  onContextFavorite?: (id: string) => void
  onContextTags?: (id: string) => void
  onContextMove?: (id: string, type: "file" | "folder") => void
  onContextShare?: (id: string, type: "file" | "folder") => void
  selectedCount: number
  selectionContextActions?: SelectionContextActions
  dndEnabled: boolean
}

function FileListRow({
  file,
  index,
  workspaceId,
  isSelected,
  isFocused,
  onItemClick,
  onContextPreview,
  onContextDownload,
  onContextRename,
  onContextDelete,
  onContextFavorite,
  onContextTags,
  onContextMove,
  onContextShare,
  selectedCount,
  selectionContextActions,
  dndEnabled,
}: FileListRowProps) {
  const dragId = `file-${file.id}`
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: dragId,
    disabled: !dndEnabled,
    data: { type: "file", id: file.id },
  })
  const setClipboard = useExplorerStore((state) => state.setClipboard)
  const runMenuAction = useMenuAction()
  const useSelectionActions = isSelected && selectedCount > 1

  return (
    <FileContextMenu
      key={file.id}
      itemId={file.id}
      itemType="file"
      scope={useSelectionActions ? "selection" : "item"}
      downloadLabel={useSelectionActions ? selectionContextActions?.downloadLabel : undefined}
      copyLabel={useSelectionActions ? "Copy selected" : undefined}
      moveLabel={useSelectionActions ? "Move selected" : undefined}
      shareLabel={useSelectionActions ? "Share selected" : undefined}
      deleteLabel={useSelectionActions ? "Delete selected" : undefined}
      favoriteLabel={
        useSelectionActions
          ? "Favorite files"
          : file.isFavorited
            ? "Remove favorite"
            : "Add favorite"
      }
      onPreview={
        !useSelectionActions && onContextPreview ? () => onContextPreview(file.id) : undefined
      }
      onDownload={
        useSelectionActions
          ? selectionContextActions?.onDownload
          : onContextDownload
            ? () => onContextDownload(file.id)
            : undefined
      }
      onRename={
        !useSelectionActions && onContextRename ? () => onContextRename(file.id, "file") : undefined
      }
      onDelete={
        useSelectionActions
          ? selectionContextActions?.onDelete
          : onContextDelete
            ? () => onContextDelete(file.id, "file")
            : undefined
      }
      onFavorite={
        useSelectionActions
          ? selectionContextActions?.onFavorite
          : onContextFavorite
            ? () => onContextFavorite(file.id)
            : undefined
      }
      onTags={
        useSelectionActions
          ? selectionContextActions?.onTags
          : onContextTags
            ? () => onContextTags(file.id)
            : undefined
      }
      onMove={
        useSelectionActions
          ? selectionContextActions?.onMove
          : onContextMove
            ? () => onContextMove(file.id, "file")
            : undefined
      }
      onShare={
        useSelectionActions
          ? selectionContextActions?.onShare
          : onContextShare
            ? () => onContextShare(file.id, "file")
            : undefined
      }
      onCopy={
        useSelectionActions
          ? selectionContextActions?.onCopy
          : () => {
              setClipboard({
                action: "copy",
                fileIds: [file.id],
                folderIds: [],
              })
            }
      }
    >
      <div
        ref={setNodeRef}
        data-selectable-item
        data-item-id={file.id}
        data-item-type="file"
        data-item-index={index}
        onClick={(e) => {
          if (dndEnabled && isDragging) return
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            onItemClick(file.id, "file", index, e)
            return
          }
          onContextPreview?.(file.id)
        }}
        className={`${rowClass} ${
          isDragging
            ? "opacity-50"
            : isSelected
              ? "bg-accent/10"
              : isFocused
                ? "bg-surface-hover"
                : ""
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5">
          {dndEnabled && (
            <button
              type="button"
              aria-label="Drag file"
              className="text-text-tertiary hover:bg-surface-default hover:text-text-primary rounded p-1 transition-colors"
              onClick={(e) => e.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <span className="bg-surface-hover flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-lg">
            <FileThumbnail
              workspaceId={workspaceId}
              fileId={file.id}
              mimeType={file.mimeType}
              thumbnailKey={file.thumbnailKey}
              fallback={getFileIcon(file.mimeType)}
              className="h-full w-full"
            />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-text-primary truncate text-sm">{file.originalName}</span>
              {file.isFavorited && <Star className="fill-warning text-warning h-3.5 w-3.5" />}
            </div>
            {renderTagPreview(file)}
          </div>
        </div>
        <div className="text-text-tertiary hidden w-24 px-4 py-2.5 text-sm md:block">
          {formatBytes(file.sizeBytes)}
        </div>
        <div className="hidden w-40 px-4 py-2.5 lg:block">
          {file.tags && file.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {file.tags.slice(0, 2).map((tag) => (
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
              {file.tags.length > 2 && (
                <span className="bg-surface-hover text-text-secondary rounded-full px-2 py-0.5 text-[10px]">
                  +{file.tags.length - 2}
                </span>
              )}
            </div>
          ) : (
            <span className="text-text-tertiary text-xs">No tags</span>
          )}
        </div>
        <div className="text-text-tertiary hidden w-32 px-4 py-2.5 text-sm sm:block">
          {formatRelativeDate(file.updatedAt)}
        </div>
        <div className="w-10 px-4 py-2.5">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="text-text-tertiary hover:bg-surface-default hover:text-text-primary rounded p-1 transition-colors"
                aria-label="More options"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="border-border-default bg-surface-default z-50 min-w-[160px] overflow-hidden rounded-lg border p-1.5 shadow-lg"
                side="bottom"
                align="end"
              >
                {useSelectionActions ? (
                  renderSelectionDropdownItems(selectionContextActions, runMenuAction)
                ) : (
                  <>
                    {onContextPreview && (
                      <DropdownMenu.Item
                        className={dropdownItemClass}
                        onClick={(event) => runMenuAction(event, () => onContextPreview(file.id))}
                        onSelect={(event) => runMenuAction(event, () => onContextPreview(file.id))}
                      >
                        Preview
                      </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Item
                      className={dropdownItemClass}
                      onClick={(event) => runMenuAction(event, () => onContextDownload?.(file.id))}
                      onSelect={(event) => runMenuAction(event, () => onContextDownload?.(file.id))}
                    >
                      Download
                    </DropdownMenu.Item>
                    {onContextRename && (
                      <DropdownMenu.Item
                        className={dropdownItemClass}
                        onClick={(event) =>
                          runMenuAction(event, () => onContextRename(file.id, "file"))
                        }
                        onSelect={(event) =>
                          runMenuAction(event, () => onContextRename(file.id, "file"))
                        }
                      >
                        Rename
                      </DropdownMenu.Item>
                    )}
                    {onContextFavorite && (
                      <DropdownMenu.Item
                        className={dropdownItemClass}
                        onClick={(event) => runMenuAction(event, () => onContextFavorite(file.id))}
                        onSelect={(event) => runMenuAction(event, () => onContextFavorite(file.id))}
                      >
                        {file.isFavorited ? "Remove favorite" : "Add favorite"}
                      </DropdownMenu.Item>
                    )}
                    {onContextTags && (
                      <DropdownMenu.Item
                        className={dropdownItemClass}
                        onClick={(event) => runMenuAction(event, () => onContextTags(file.id))}
                        onSelect={(event) => runMenuAction(event, () => onContextTags(file.id))}
                      >
                        Tags
                      </DropdownMenu.Item>
                    )}
                    {onContextMove && (
                      <DropdownMenu.Item
                        className={dropdownItemClass}
                        onClick={(event) =>
                          runMenuAction(event, () => onContextMove(file.id, "file"))
                        }
                        onSelect={(event) =>
                          runMenuAction(event, () => onContextMove(file.id, "file"))
                        }
                      >
                        Move
                      </DropdownMenu.Item>
                    )}
                    {onContextShare && (
                      <DropdownMenu.Separator className="bg-border-muted mx-2 my-1 h-px" />
                    )}
                    {onContextShare && (
                      <DropdownMenu.Item
                        className={dropdownItemClass}
                        onClick={(event) =>
                          runMenuAction(event, () => onContextShare(file.id, "file"))
                        }
                        onSelect={(event) =>
                          runMenuAction(event, () => onContextShare(file.id, "file"))
                        }
                      >
                        Share
                      </DropdownMenu.Item>
                    )}
                    {onContextDelete && (
                      <DropdownMenu.Separator className="bg-border-muted mx-2 my-1 h-px" />
                    )}
                    {onContextDelete && (
                      <DropdownMenu.Item
                        className={dropdownItemClass}
                        onClick={(event) =>
                          runMenuAction(event, () => onContextDelete(file.id, "file"))
                        }
                        onSelect={(event) =>
                          runMenuAction(event, () => onContextDelete(file.id, "file"))
                        }
                      >
                        Delete
                      </DropdownMenu.Item>
                    )}
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </FileContextMenu>
  )
}

interface FileListProps {
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
  onContextPreview?: (id: string) => void
  onContextDownload?: (id: string) => void
  onContextRename?: (id: string, type: "file" | "folder") => void
  onContextDelete?: (id: string, type: "file" | "folder") => void
  onContextFavorite?: (id: string) => void
  onContextTags?: (id: string) => void
  onContextMove?: (id: string, type: "file" | "folder") => void
  onContextShare?: (id: string, type: "file" | "folder") => void
  selectionContextActions?: SelectionContextActions
  emptyTitle?: string
  emptyDescription?: string
  onItemDrop?: (sourceId: string, sourceType: "file" | "folder", targetFolderId: string) => void
  onSelectionPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  onSelectionPointerMove?: (event: PointerEvent<HTMLDivElement>) => void
  onSelectionPointerUp?: (event: PointerEvent<HTMLDivElement>) => void
  onSelectionPointerCancel?: (event: PointerEvent<HTMLDivElement>) => void
}

export function FileList({
  workspaceId,
  folders,
  files,
  isLoading,
  onFolderClick,
  onItemClick,
  onContextPreview,
  onContextDownload,
  onContextRename,
  onContextDelete,
  onContextFavorite,
  onContextTags,
  onContextMove,
  onContextShare,
  selectionContextActions,
  emptyTitle = "No files yet",
  emptyDescription = "Drag files here to upload",
  onItemDrop,
  onSelectionPointerDown,
  onSelectionPointerMove,
  onSelectionPointerUp,
  onSelectionPointerCancel,
}: FileListProps) {
  const selectedFileIds = useExplorerStore((s) => s.selectedFileIds)
  const selectedFolderIds = useExplorerStore((s) => s.selectedFolderIds)
  const focusedItemId = useExplorerStore((s) => s.focusedItemId)
  const dndEnabled = !!onItemDrop
  const selectedCount = Number(selectedFileIds.length) + Number(selectedFolderIds.length)

  const allItems = useMemo(
    () => [
      ...folders.map((f) => ({ type: "folder" as const, data: f })),
      ...files.map((f) => ({ type: "file" as const, data: f })),
    ],
    [folders, files],
  )

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
            <div className="bg-surface-hover h-5 w-5 animate-pulse rounded" />
            <div className="bg-surface-hover h-4 flex-1 animate-pulse rounded" />
            <div className="bg-surface-hover h-4 w-16 animate-pulse rounded" />
            <div className="bg-surface-hover h-4 w-24 animate-pulse rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (folders.length === 0 && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <Folder className="text-text-tertiary h-12 w-12" />
        <p className="text-text-primary text-sm font-medium">{emptyTitle}</p>
        <p className="text-text-tertiary text-sm">{emptyDescription}</p>
      </div>
    )
  }

  return (
    <div
      className="border-border-default min-h-48 overflow-hidden rounded-xl border sm:min-h-[calc(100dvh-420px)]"
      onPointerDown={onSelectionPointerDown}
      onPointerMove={onSelectionPointerMove}
      onPointerUp={onSelectionPointerUp}
      onPointerCancel={onSelectionPointerCancel}
    >
      {/* Header */}
      <div
        className="border-border-muted bg-surface-default hidden border-b sm:flex"
        data-selection-ignore
      >
        <div className="text-text-tertiary flex-1 px-4 py-2.5 text-left text-xs font-medium">
          Name
        </div>
        <div className="text-text-tertiary hidden w-24 px-4 py-2.5 text-left text-xs font-medium md:block">
          Size
        </div>
        <div className="text-text-tertiary hidden w-40 px-4 py-2.5 text-left text-xs font-medium lg:block">
          Tags
        </div>
        <div className="text-text-tertiary hidden w-32 px-4 py-2.5 text-left text-xs font-medium sm:block">
          Modified
        </div>
        <div className="w-10 px-4 py-2.5" />
      </div>

      <div className="max-h-[calc(100dvh-300px)] overflow-auto">
        {allItems.map((item, index) => {
          if (item.type === "folder") {
            const folder = item.data
            return (
              <FolderListRow
                key={folder.id}
                folder={folder}
                index={index}
                isSelected={selectedFolderIds.includes(folder.id)}
                isFocused={focusedItemId === folder.id}
                onFolderClick={onFolderClick}
                onItemClick={onItemClick}
                onContextRename={onContextRename}
                onContextDelete={onContextDelete}
                onContextMove={onContextMove}
                onContextShare={onContextShare}
                selectedCount={selectedCount}
                selectionContextActions={selectionContextActions}
                dndEnabled={dndEnabled}
              />
            )
          }

          const file = item.data
          return (
            <FileListRow
              key={file.id}
              file={file}
              index={index}
              workspaceId={workspaceId}
              isSelected={selectedFileIds.includes(file.id)}
              isFocused={focusedItemId === file.id}
              onItemClick={onItemClick}
              onContextPreview={onContextPreview}
              onContextDownload={onContextDownload}
              onContextRename={onContextRename}
              onContextDelete={onContextDelete}
              onContextFavorite={onContextFavorite}
              onContextTags={onContextTags}
              onContextMove={onContextMove}
              onContextShare={onContextShare}
              selectedCount={selectedCount}
              selectionContextActions={selectionContextActions}
              dndEnabled={dndEnabled}
            />
          )
        })}
      </div>
    </div>
  )
}
