/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/restrict-plus-operands */
import {
  Pencil,
  Trash2,
  FolderInput,
  Star,
  X,
  type LucideIcon,
} from "lucide-react"
import { useExplorerStore } from "@/stores/explorer-store"
import type { Command, CommandCategory } from "./types"

export const FILE_COMMAND_EVENT = "bucketdrive:file-command"
export type FileCommandAction = "rename" | "delete" | "move" | "favorite"

function dispatchFileCommand(action: FileCommandAction) {
  window.dispatchEvent(new CustomEvent<FileCommandAction>(FILE_COMMAND_EVENT, { detail: action }))
}

interface FileOperationCommandDef {
  id: string
  title: string
  subtitle?: string
  icon: LucideIcon
  category: CommandCategory
  keywords?: string[]
  condition?: () => boolean
  action: () => void
}

function getFileOperationCommands(): FileOperationCommandDef[] {
  return [
    {
      id: "file-rename",
      title: "Rename Selected",
      subtitle: "Rename the focused item",
      icon: Pencil,
      category: "file",
      keywords: ["rename", "name", "edit"],
      condition: () => {
        const state = useExplorerStore.getState()
        const totalSelected = state.selectedFileIds.length + state.selectedFolderIds.length
        return totalSelected === 1
      },
      action: () => {
        dispatchFileCommand("rename")
      },
    },
    {
      id: "file-delete",
      title: "Delete Selected",
      subtitle: "Move selected items to trash",
      icon: Trash2,
      category: "file",
      keywords: ["delete", "trash", "remove"],
      condition: () => {
        const state = useExplorerStore.getState()
        return state.selectedFileIds.length + state.selectedFolderIds.length > 0
      },
      action: () => {
        dispatchFileCommand("delete")
      },
    },
    {
      id: "file-move",
      title: "Move Selected",
      subtitle: "Move selected items to another folder",
      icon: FolderInput,
      category: "file",
      keywords: ["move", "transfer", "folder"],
      condition: () => {
        const state = useExplorerStore.getState()
        return state.selectedFileIds.length + state.selectedFolderIds.length > 0
      },
      action: () => {
        dispatchFileCommand("move")
      },
    },
    {
      id: "file-favorite",
      title: "Toggle Favorite",
      subtitle: "Add or remove from favorites",
      icon: Star,
      category: "file",
      keywords: ["favorite", "star", "bookmark"],
      condition: () => {
        const state = useExplorerStore.getState()
        return state.selectedFileIds.length === 1 && state.selectedFolderIds.length === 0
      },
      action: () => {
        dispatchFileCommand("favorite")
      },
    },
    {
      id: "file-clear-selection",
      title: "Clear Selection",
      subtitle: "Deselect all items",
      icon: X,
      category: "file",
      keywords: ["clear", "deselect", "selection"],
      condition: () => {
        const state = useExplorerStore.getState()
        return state.selectedFileIds.length + state.selectedFolderIds.length > 0
      },
      action: () => {
        useExplorerStore.getState().clearSelection()
      },
    },
  ]
}

export function getFileOperationCommandsFiltered(): Command[] {
  return getFileOperationCommands()
    .filter((def) => (def.condition ? def.condition() : true))
    .map((def) => ({
      id: def.id,
      title: def.title,
      subtitle: def.subtitle,
      icon: def.icon,
      category: def.category,
      keywords: def.keywords,
      action: def.action,
    }))
}
