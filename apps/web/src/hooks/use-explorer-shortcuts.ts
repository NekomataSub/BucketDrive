/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/restrict-plus-operands */
import { useEffect, useCallback } from "react"
import { useExplorerStore } from "@/stores/explorer-store"

interface ExplorerItem {
  id: string
  type: "file" | "folder"
}

interface UseExplorerShortcutsOptions {
  items: ExplorerItem[]
  containerRef: React.RefObject<HTMLElement | null>
  onOpenItem: (id: string, type: "file" | "folder") => void
  onPreviewItem?: (id: string) => void
  onDeleteSelected: () => void
  onNavigateParent: () => void
  onRenameItem: (id: string, type: "file" | "folder") => void
  onUndo?: () => void
}

function getGridCols(container: HTMLElement): number {
  const width = container.clientWidth
  if (width >= 1280) return 6
  if (width >= 1024) return 5
  if (width >= 768) return 4
  if (width >= 640) return 3
  return 2
}

export function useExplorerShortcuts({
  items,
  containerRef,
  onOpenItem,
  onPreviewItem,
  onDeleteSelected,
  onNavigateParent,
  onRenameItem,
  onUndo,
}: UseExplorerShortcutsOptions) {
  const {
    viewMode,
    selectedFileIds,
    selectedFolderIds,
    focusedItemId,
    previewFileId,
    selectItem,
    selectAll,
    clearSelection,
    setFocusedItem,
    selectRange,
    lastClickedItemIndex,
    setClipboard,
    clipboard,
  } = useExplorerStore()

  const focusedIndex = items.findIndex((item) => item.id === focusedItemId)

  const moveFocus = useCallback(
    (direction: number) => {
      if (items.length === 0) return
      const nextIndex = Math.max(0, Math.min(items.length - 1, focusedIndex + direction))
      const nextItem = items[nextIndex]
      if (nextItem) {
        setFocusedItem(nextItem.id, nextItem.type)
      }
    },
    [items, focusedIndex, setFocusedItem],
  )

  const moveFocusGrid = useCallback(
    (dx: number, dy: number) => {
      if (items.length === 0) return
      const container = containerRef.current
      const cols = container ? getGridCols(container) : 1
      const nextIndex = focusedIndex + dx + dy * cols
      const clamped = Math.max(0, Math.min(items.length - 1, nextIndex))
      const nextItem = items[clamped]
      if (nextItem) {
        setFocusedItem(nextItem.id, nextItem.type)
      }
    },
    [items, focusedIndex, setFocusedItem, containerRef],
  )

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)

      if (isInput) return

      // Let Ctrl/Cmd+K open the command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        return
      }

      const focusedItem = items.find((item) => item.id === focusedItemId)
      const allSelected = selectedFileIds.length + selectedFolderIds.length

      if (e.key === "ArrowDown") {
        e.preventDefault()
        if (viewMode === "grid") {
          moveFocusGrid(0, 1)
        } else {
          moveFocus(1)
        }
        return
      }

      if (e.key === "ArrowUp") {
        e.preventDefault()
        if (viewMode === "grid") {
          moveFocusGrid(0, -1)
        } else {
          moveFocus(-1)
        }
        return
      }

      if (viewMode === "grid") {
        if (e.key === "ArrowRight") {
          e.preventDefault()
          moveFocusGrid(1, 0)
          return
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault()
          moveFocusGrid(-1, 0)
          return
        }
      }

      if (e.key === "Enter") {
        e.preventDefault()
        const itemToOpen =
          allSelected === 1
            ? items.find(
                (item) =>
                  item.id === selectedFileIds[0] ||
                  item.id === selectedFolderIds[0],
              )
            : focusedItem
        if (itemToOpen?.type === "file" && onPreviewItem) {
          onPreviewItem(itemToOpen.id)
        } else if (itemToOpen) {
          onOpenItem(itemToOpen.id, itemToOpen.type)
        }
        return
      }

      if (e.key === " " && !previewFileId) {
        e.preventDefault()
        const itemToPreview =
          allSelected === 1
            ? items.find(
                (item) =>
                  item.id === selectedFileIds[0] ||
                  item.id === selectedFolderIds[0],
              )
            : focusedItem
        if (itemToPreview && itemToPreview.type === "file" && onPreviewItem) {
          onPreviewItem(itemToPreview.id)
        }
        return
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (allSelected > 0) {
          e.preventDefault()
          onDeleteSelected()
        }
        return
      }

      if (e.key === "Backspace" && allSelected === 0) {
        e.preventDefault()
        onNavigateParent()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault()
        const fileIds = items.filter((i) => i.type === "file").map((i) => i.id)
        const folderIds = items.filter((i) => i.type === "folder").map((i) => i.id)
        selectAll(fileIds, folderIds)
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        onUndo?.()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault()
        setClipboard({
          action: "copy",
          fileIds: selectedFileIds,
          folderIds: selectedFolderIds,
        })
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "x") {
        e.preventDefault()
        setClipboard({
          action: "cut",
          fileIds: selectedFileIds,
          folderIds: selectedFolderIds,
        })
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (clipboard) {
          e.preventDefault()
        }
        return
      }

      if (e.key === "F2") {
        e.preventDefault()
        if (focusedItem) {
          onRenameItem(focusedItem.id, focusedItem.type)
        }
        return
      }

      if (e.key === "Escape") {
        e.preventDefault()
        clearSelection()
        return
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [
    items,
    focusedItemId,
    previewFileId,
    viewMode,
    selectedFileIds,
    selectedFolderIds,
    lastClickedItemIndex,
    clipboard,
    moveFocus,
    moveFocusGrid,
    onOpenItem,
    onPreviewItem,
    onDeleteSelected,
    onNavigateParent,
    onRenameItem,
    selectAll,
    clearSelection,
    setClipboard,
    selectRange,
  ])

  const handleItemClick = useCallback(
    (id: string, type: "file" | "folder", index: number, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
      if (event.ctrlKey || event.metaKey) {
        useExplorerStore.getState().toggleSelect(id, type)
      } else if (event.shiftKey && lastClickedItemIndex !== null) {
        const start = Math.min(lastClickedItemIndex, index)
        const end = Math.max(lastClickedItemIndex, index)
        const rangeItems = items.slice(start, end + 1)
        const fileIds = rangeItems.filter((i) => i.type === "file").map((i) => i.id)
        const folderIds = rangeItems.filter((i) => i.type === "folder").map((i) => i.id)
        selectRange(
          type === "file" ? fileIds : folderIds,
          type,
          index,
        )
        if (folderIds.length > 0) {
          useExplorerStore.getState().selectRange(folderIds, "folder", index)
        }
        if (fileIds.length > 0) {
          useExplorerStore.getState().selectRange(fileIds, "file", index)
        }
      } else {
        selectItem(id, type, index)
      }
    },
    [items, lastClickedItemIndex, selectItem, selectRange],
  )

  return { handleItemClick }
}
