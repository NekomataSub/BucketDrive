/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions */
import { useState, useCallback } from "react"
import { ChevronRight, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from "lucide-react"
import { useFolders, useWorkspaces, useCreateFolder, useUpdateFolder, useDeleteFolder } from "@/lib/api"
import { useExplorerStore } from "@/stores/explorer-store"
import * as ContextMenu from "@radix-ui/react-context-menu"
import type { Folder as FolderType } from "@bucketdrive/shared"

const contextMenuItemClass =
  "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-text-primary outline-none data-[highlighted]:bg-surface-active"

interface TreeNodeProps {
  folder: FolderType
  depth: number
  workspaceId: string
  currentFolderId: string | null
  onRename: (folderId: string, currentName: string) => void
  onDelete: (folderId: string, name: string) => void
  onCreateSubfolder: (parentFolderId: string) => void
}

function TreeNode({
  folder,
  depth,
  workspaceId,
  currentFolderId,
  onRename,
  onDelete,
  onCreateSubfolder,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const { data: childrenData } = useFolders(workspaceId, expanded ? folder.id : undefined)
  const children = childrenData?.data ?? []
  const navigateTo = useExplorerStore((s) => s.navigateTo)
  const isActive = currentFolderId === folder.id
  const handleNavigate = () => navigateTo(folder.id)

  return (
    <div>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            role="button"
            tabIndex={0}
            onClick={handleNavigate}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                handleNavigate()
              }
            }}
            className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover ${
              isActive ? "bg-surface-active text-text-primary" : "text-text-secondary"
            } focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-muted`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(!expanded)
              }}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition-transform ${
                expanded ? "rotate-90" : ""
              }`}
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              <ChevronRight className="h-3 w-3 text-text-tertiary" />
            </button>
            {isActive ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-accent" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-text-tertiary" />
            )}
            <span className="truncate">{folder.name}</span>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="z-50 min-w-[160px] overflow-hidden rounded-lg border border-border-default bg-surface-default p-1.5 shadow-lg">
            <ContextMenu.Item
              className={contextMenuItemClass}
              onClick={() => {
                onCreateSubfolder(folder.id)
              }}
            >
              <FolderPlus className="h-3.5 w-3.5 text-text-tertiary" />
              New Subfolder
            </ContextMenu.Item>
            <ContextMenu.Item
              className={contextMenuItemClass}
              onClick={() => {
                onRename(folder.id, folder.name)
              }}
            >
              <Pencil className="h-3.5 w-3.5 text-text-tertiary" />
              Rename
            </ContextMenu.Item>
            <ContextMenu.Item
              className={contextMenuItemClass}
              onClick={() => {
                onDelete(folder.id, folder.name)
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-text-tertiary" />
              Delete
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {expanded &&
        children.map((child) => (
          <TreeNode
            key={child.id}
            folder={child}
            depth={depth + 1}
            workspaceId={workspaceId}
            currentFolderId={currentFolderId}
            onRename={onRename}
            onDelete={onDelete}
            onCreateSubfolder={onCreateSubfolder}
          />
        ))}
    </div>
  )
}

export function FolderTree() {
  const { data: workspacesData } = useWorkspaces()
  const workspaceId = workspacesData?.data?.[0]?.id ?? null
  const currentFolderId = useExplorerStore((s) => s.currentFolderId)
  const { data: rootFoldersData } = useFolders(workspaceId, null)
  const rootFolders = rootFoldersData?.data ?? []
  const createFolderMutation = useCreateFolder(workspaceId)
  const updateFolderMutation = useUpdateFolder(workspaceId)
  const deleteFolderMutation = useDeleteFolder(workspaceId)
  const navigateToRoot = useExplorerStore((s) => s.navigateToRoot)

  const handleCreateRootFolder = useCallback(() => {
    const name = window.prompt("Folder name:")
    if (name?.trim()) {
      createFolderMutation.mutate({ name: name.trim(), parentFolderId: null })
    }
  }, [createFolderMutation])

  const handleRename = useCallback(
    (folderId: string, currentName: string) => {
      const name = window.prompt("Rename to:", currentName)
      if (name?.trim() && name !== currentName) {
        updateFolderMutation.mutate({ folderId, name: name.trim() })
      }
    },
    [updateFolderMutation],
  )

  const handleDelete = useCallback(
    (folderId: string, name: string) => {
      const confirmed = window.confirm(`Delete folder "${name}"?`)
      if (confirmed) {
        deleteFolderMutation.mutate({ folderId })
      }
    },
    [deleteFolderMutation],
  )

  const handleCreateSubfolder = useCallback(
    (parentFolderId: string) => {
      const name = window.prompt("Folder name:")
      if (name?.trim()) {
        createFolderMutation.mutate({ name: name.trim(), parentFolderId })
      }
    },
    [createFolderMutation],
  )

  if (!workspaceId) return null

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          Folders
        </span>
        <button
          type="button"
          onClick={handleCreateRootFolder}
          className="rounded p-0.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label="New root folder"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => navigateToRoot()}
        className={`flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover ${
          currentFolderId === null
            ? "bg-surface-active text-text-primary"
            : "text-text-secondary"
        }`}
      >
        <FolderOpen className="h-4 w-4 shrink-0 text-text-tertiary" />
        <span className="truncate">All Files</span>
      </button>
      {rootFolders.map((folder) => (
        <TreeNode
          key={folder.id}
          folder={folder}
          depth={0}
          workspaceId={workspaceId}
          currentFolderId={currentFolderId}
          onRename={handleRename}
          onDelete={handleDelete}
          onCreateSubfolder={handleCreateSubfolder}
        />
      ))}
    </div>
  )
}
