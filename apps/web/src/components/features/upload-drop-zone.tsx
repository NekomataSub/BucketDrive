import { useCallback, useState, type DragEvent } from "react"
import { Upload } from "lucide-react"

interface UploadDropZoneProps {
  onFilesDrop: (
    entries: Array<{ file: File; relativePath: string }>,
    emptyFolders: string[],
  ) => void
  onClickUpload?: () => void
  className?: string
}

async function readEntriesAsync(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject)
  })
}

async function traverseEntry(
  entry: FileSystemEntry,
  path: string,
  result: Array<{ file: File; relativePath: string }>,
  emptyFolders: string[],
  depth: number,
): Promise<void> {
  if (depth > 50) return
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject)
    })
    result.push({ file, relativePath: path ? `${path}/${entry.name}` : entry.name })
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    const dirPath = path ? `${path}/${entry.name}` : entry.name
    const reader = dirEntry.createReader()
    let entries: FileSystemEntry[] = []
    try {
      entries = await readEntriesAsync(reader)
    } catch {
      // ignore read errors
    }
    if (entries.length === 0) {
      emptyFolders.push(dirPath)
    }
    for (const child of entries) {
      await traverseEntry(child, dirPath, result, emptyFolders, depth + 1)
    }
  }
}

export function UploadDropZone({
  onFilesDrop,
  onClickUpload,
  className = "",
}: UploadDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const dtItems = e.dataTransfer.items
      if (dtItems.length === 0) {
        // Fallback to flat files if items API is not available
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) {
          onFilesDrop(
            files.map((file) => ({ file, relativePath: file.name })),
            [],
          )
        }
        return
      }

      const entries: Array<{ file: File; relativePath: string }> = []
      const emptyFolders: string[] = []

      for (const item of Array.from(dtItems)) {
        const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null
        if (entry) {
          await traverseEntry(entry, "", entries, emptyFolders, 0)
        } else {
          const file = item.getAsFile()
          if (file) {
            entries.push({ file, relativePath: file.name })
          }
        }
      }

      if (entries.length > 0 || emptyFolders.length > 0) {
        onFilesDrop(entries, emptyFolders)
      }
    },
    [onFilesDrop],
  )

  return (
    <button
      type="button"
      onClick={onClickUpload}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label="Upload files"
      className={`focus-visible:ring-accent focus-visible:ring-offset-surface-default group hover:bg-accent/5 relative block w-full rounded-xl border-2 border-dashed text-left transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${onClickUpload ? "cursor-pointer" : "cursor-default"} ${isDragging ? "border-accent bg-accent/10 scale-[1.02]" : "border-border-default hover:border-accent"} ${className}`}
    >
      <div className="pointer-events-none flex flex-col items-center justify-center gap-3 py-12">
        <div
          className={`rounded-full p-4 transition-colors ${isDragging ? "bg-accent/20 text-accent" : "bg-surface-hover text-text-tertiary group-hover:bg-accent/15 group-hover:text-accent"}`}
        >
          <Upload className="h-8 w-8" />
        </div>
        <div className="text-center">
          <p className="text-text-primary text-sm font-medium">
            {isDragging
              ? "Drop files to upload"
              : onClickUpload
                ? "Click or drag files or folders here to upload"
                : "Drag files or folders here to upload"}
          </p>
          <p className="text-text-tertiary mt-1 text-xs">
            Uses the current folder selected in the explorer
          </p>
        </div>
      </div>
    </button>
  )
}
