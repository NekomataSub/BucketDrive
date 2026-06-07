/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions */
import { useState, useCallback } from "react"
import { ChevronRight, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from "lucide-react"
import {
  useFolders,
  useWorkspaces,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
} from "@/lib/api"
import { useExplorerStore } from "@/stores/explorer-store"
import { useNavigate } from "@tanstack/react-router"
import * as ContextMenu from "@radix-ui/react-context-menu"
import { can, type Folder as FolderType, type WorkspaceRole } from "@bucketdrive/shared"

const contextMenuItemClass =
  "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-text-primary outline-none data-[highlighted]:bg-surface-active"

const depthPaddingClasses = [
  "pl-[8px]",
  "pl-[20px]",
  "pl-[32px]",
  "pl-[44px]",
  "pl-[56px]",
  "pl-[68px]",
] as const

interface TreeNodeProps {
  folder: FolderType
  depth: number
  workspaceId: string
  currentFolderId: string | null
  onRename: (folderId: string, currentName: string) => void
  onDelete: (folderId: string, name: string) => void
  onCreateSubfolder: (parentFolderId: string) => void
  onNavigate: (folderId: string | null) => void
  canCreateFolder: boolean
  canRenameFolder: boolean
  canDeleteFolder: boolean
}

function TreeNode({
  folder,
  depth,
  workspaceId,
  currentFolderId,
  onRename,
  onDelete,
  onCreateSubfolder,
  onNavigate,
  canCreateFolder,
  canRenameFolder,
  canDeleteFolder,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const { data: childrenData } = useFolders(workspaceId, expanded ? folder.id : undefined)
  const children = childrenData?.data ?? []
  const isActive = currentFolderId === folder.id
  const hasFolderActions = canCreateFolder || canRenameFolder || canDeleteFolder
  const depthClass = depthPaddingClasses[Math.min(depth, depthPaddingClasses.length - 1)]
  const handleNavigate = () => {
    onNavigate(folder.id)
  }

  return (
    <div>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className={`hover:bg-surface-hover flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
              isActive ? "bg-surface-active text-text-primary" : "text-text-secondary"
            } ${depthClass} focus-visible:ring-border-muted focus-visible:ring-1 focus-visible:outline-none`}
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
              <ChevronRight className="text-text-tertiary h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleNavigate}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none"
            >
              {isActive ? (
                <FolderOpen className="text-accent h-4 w-4 shrink-0" />
              ) : (
                <Folder className="text-text-tertiary h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{folder.name}</span>
            </button>
          </div>
        </ContextMenu.Trigger>
        {hasFolderActions && (
          <ContextMenu.Portal>
            <ContextMenu.Content className="border-border-default bg-surface-default z-50 min-w-[160px] overflow-hidden rounded-lg border p-1.5 shadow-lg">
              {canCreateFolder && (
                <ContextMenu.Item
                  className={contextMenuItemClass}
                  onClick={() => {
                    onCreateSubfolder(folder.id)
                  }}
                >
                  <FolderPlus className="text-text-tertiary h-3.5 w-3.5" />
                  New Subfolder
                </ContextMenu.Item>
              )}
              {canRenameFolder && (
                <ContextMenu.Item
                  className={contextMenuItemClass}
                  onClick={() => {
                    onRename(folder.id, folder.name)
                  }}
                >
                  <Pencil className="text-text-tertiary h-3.5 w-3.5" />
                  Rename
                </ContextMenu.Item>
              )}
              {canDeleteFolder && (
                <ContextMenu.Item
                  className={contextMenuItemClass}
                  onClick={() => {
                    onDelete(folder.id, folder.name)
                  }}
                >
                  <Trash2 className="text-text-tertiary h-3.5 w-3.5" />
                  Delete
                </ContextMenu.Item>
              )}
            </ContextMenu.Content>
          </ContextMenu.Portal>
        )}
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
            onNavigate={onNavigate}
            canCreateFolder={canCreateFolder}
            canRenameFolder={canRenameFolder}
            canDeleteFolder={canDeleteFolder}
          />
        ))}
    </div>
  )
}

export function FolderTree() {
  const navigate = useNavigate()
  const { data: workspacesData } = useWorkspaces()
  const workspace = workspacesData?.data?.[0]
  const workspaceId = workspace?.id ?? null
  const workspaceRole = (workspace?.role ?? "viewer") as WorkspaceRole
  const currentFolderId = useExplorerStore((s) => s.currentFolderId)
  const { data: rootFoldersData } = useFolders(workspaceId, null)
  const rootFolders = rootFoldersData?.data ?? []
  const createFolderMutation = useCreateFolder(workspaceId)
  const updateFolderMutation = useUpdateFolder(workspaceId)
  const deleteFolderMutation = useDeleteFolder(workspaceId)
  const canCreateFolder = can(workspaceRole, "folders.create")
  const canRenameFolder = can(workspaceRole, "folders.rename")
  const canDeleteFolder = can(workspaceRole, "folders.delete")

  const handleNavigate = useCallback(
    (folderId: string | null) => {
      void navigate({
        to: "/dashboard/files",
        search: { folderId: folderId ?? undefined, previewFileId: undefined },
      })
    },
    [navigate],
  )

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
        <span className="text-text-tertiary text-[11px] font-semibold tracking-wider uppercase">
          Folders
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          handleNavigate(null)
        }}
        className={`hover:bg-surface-hover flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-xs transition-colors ${
          currentFolderId === null ? "bg-surface-active text-text-primary" : "text-text-secondary"
        }`}
      >
        <FolderOpen className="text-text-tertiary h-4 w-4 shrink-0" />
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
          onNavigate={handleNavigate}
          canCreateFolder={canCreateFolder}
          canRenameFolder={canRenameFolder}
          canDeleteFolder={canDeleteFolder}
        />
      ))}
    </div>
  )
}
