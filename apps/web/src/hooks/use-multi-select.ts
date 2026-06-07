import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export interface MultiSelectItem {
  id: string
  type: string
}

interface SelectionRect {
  left: number
  top: number
  width: number
  height: number
}

interface UseMultiSelectOptions<T extends MultiSelectItem> {
  items: T[]
  containerRef: React.RefObject<HTMLElement | null>
}

function itemKey(item: MultiSelectItem) {
  return `${item.type}:${item.id}`
}

function rectsIntersect(a: DOMRect, b: DOMRect) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

function getSelectionRect(startX: number, startY: number, endX: number, endY: number) {
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  }
}

export function useMultiSelect<T extends MultiSelectItem>({
  items,
  containerRef,
}: UseMultiSelectOptions<T>) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
  const [isDraggingSelection, setIsDraggingSelection] = useState(false)
  const lastClickedIndexRef = useRef<number | null>(null)
  const dragStartRef = useRef<{ x: number; y: number; additive: boolean } | null>(null)
  const dragBaseKeysRef = useRef<string[]>([])

  const selectedItems = useMemo(() => {
    const selected = new Set(selectedKeys)
    return items.filter((item) => selected.has(itemKey(item)))
  }, [items, selectedKeys])

  const selectedIdsByType = useCallback(
    (type: string) => selectedItems.filter((item) => item.type === type).map((item) => item.id),
    [selectedItems],
  )

  const clearSelection = useCallback(() => {
    setSelectedKeys([])
    lastClickedIndexRef.current = null
  }, [])

  const selectAll = useCallback(() => {
    setSelectedKeys(items.map(itemKey))
  }, [items])

  const setSelectedItems = useCallback((nextItems: MultiSelectItem[]) => {
    setSelectedKeys(Array.from(new Set(nextItems.map(itemKey))))
  }, [])

  const isSelected = useCallback(
    (item: MultiSelectItem) => selectedKeys.includes(itemKey(item)),
    [selectedKeys],
  )

  const handleItemClick = useCallback(
    (item: T, index: number, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
      const key = itemKey(item)

      if (event.shiftKey && lastClickedIndexRef.current !== null) {
        const start = Math.min(lastClickedIndexRef.current, index)
        const end = Math.max(lastClickedIndexRef.current, index)
        const rangeKeys = items.slice(start, end + 1).map(itemKey)
        setSelectedKeys((current) => Array.from(new Set([...current, ...rangeKeys])))
        return
      }

      lastClickedIndexRef.current = index

      if (event.ctrlKey || event.metaKey) {
        setSelectedKeys((current) =>
          current.includes(key)
            ? current.filter((selected) => selected !== key)
            : [...current, key],
        )
        return
      }

      setSelectedKeys([key])
    },
    [items],
  )

  const handleContainerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
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

      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
        clearSelection()
      }
      event.preventDefault()
      document.body.classList.add("selection-dragging")

      dragStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        additive: event.ctrlKey || event.metaKey,
      }
      dragBaseKeysRef.current = event.ctrlKey || event.metaKey ? selectedKeys : []
      setSelectionRect(getSelectionRect(event.clientX, event.clientY, event.clientX, event.clientY))
      setIsDraggingSelection(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [clearSelection, selectedKeys],
  )

  const updateDragSelection = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const start = dragStartRef.current
      const container = containerRef.current
      if (!start || !container) return
      event.preventDefault()

      const rect = getSelectionRect(start.x, start.y, event.clientX, event.clientY)
      setSelectionRect(rect)

      if (rect.width < 4 && rect.height < 4) {
        setSelectedKeys(dragBaseKeysRef.current)
        return
      }

      const selectionBox = new DOMRect(rect.left, rect.top, rect.width, rect.height)
      const hitKeys: string[] = []
      for (const node of container.querySelectorAll<HTMLElement>("[data-selectable-item]")) {
        if (!rectsIntersect(selectionBox, node.getBoundingClientRect())) continue
        const id = node.dataset.itemId
        const type = node.dataset.itemType
        if (id && type) hitKeys.push(`${type}:${id}`)
      }

      setSelectedKeys(
        start.additive ? Array.from(new Set([...dragBaseKeysRef.current, ...hitKeys])) : hitKeys,
      )
    },
    [containerRef],
  )

  const handleContainerPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      updateDragSelection(event)
    },
    [updateDragSelection],
  )

  const handleContainerPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const start = dragStartRef.current
      updateDragSelection(event)
      dragStartRef.current = null
      dragBaseKeysRef.current = []
      setSelectionRect(null)
      setIsDraggingSelection(false)
      document.body.classList.remove("selection-dragging")
      if (!start) return

      const rect = getSelectionRect(start.x, start.y, event.clientX, event.clientY)
      if (rect.width < 4 && rect.height < 4) {
        return
      }
    },
    [updateDragSelection],
  )

  const handleContainerPointerCancel = useCallback(() => {
    dragStartRef.current = null
    dragBaseKeysRef.current = []
    setSelectionRect(null)
    setIsDraggingSelection(false)
    document.body.classList.remove("selection-dragging")
  }, [])

  useEffect(() => {
    return () => {
      document.body.classList.remove("selection-dragging")
    }
  }, [])

  useEffect(() => {
    const available = new Set(items.map(itemKey))
    setSelectedKeys((current) => current.filter((key) => available.has(key)))
  }, [items])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isInput =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)

      if (isInput) return

      if ((event.ctrlKey || event.metaKey) && event.key === "a") {
        event.preventDefault()
        selectAll()
      }

      if (event.key === "Escape") {
        clearSelection()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [clearSelection, selectAll])

  return {
    selectedItems,
    selectedKeys,
    selectedCount: selectedKeys.length,
    selectionRect,
    isDraggingSelection,
    selectedIdsByType,
    setSelectedItems,
    clearSelection,
    selectAll,
    isSelected,
    handleItemClick,
    handleContainerPointerDown,
    handleContainerPointerMove,
    handleContainerPointerUp,
    handleContainerPointerCancel,
  }
}
