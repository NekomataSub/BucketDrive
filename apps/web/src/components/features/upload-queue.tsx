/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { useEffect, useRef } from "react"
import {
  X,
  ChevronUp,
  File,
  CheckCircle,
  AlertCircle,
  Loader2,
  RotateCcw,
  Pause,
  Play,
} from "lucide-react"
import { useUploadStore } from "@/stores/upload-store"
import { useUploadProcessor } from "@/hooks/use-upload"
import { ProgressBar } from "@/components/shared/progress-bar"
import type { UploadItem } from "@/stores/upload-store"

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const unit = units[i] ?? "GB"
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${unit}`
}

export function UploadQueue({ workspaceId }: { workspaceId: string }) {
  const { items, isOpen, setOpen, removeItem, clearCompleted } = useUploadStore()
  const { processQueue, cancelItem, pauseItem, resumeItem } = useUploadProcessor(workspaceId)
  const processingRef = useRef(false)

  const queuedCount = items.filter(
    (i) => i.status === "preparing" || i.status === "queued" || i.status === "uploading",
  ).length
  const failedCount = items.filter((i) => i.status === "failed").length
  const pausedCount = items.filter((i) => i.status === "paused").length
  const hasItems = items.length > 0

  useEffect(() => {
    const queued = items.filter((i) => i.status === "queued")
    if (queued.length > 0 && !processingRef.current) {
      processingRef.current = true
      processQueue().finally(() => {
        processingRef.current = false
      })
    }
  }, [items, processQueue])

  if (!isOpen && !hasItems) return null

  return (
    <div className="border-border-default bg-bg-primary fixed right-4 bottom-4 left-4 z-50 rounded-xl border shadow-lg sm:left-auto sm:w-80">
      <div className="border-border-muted flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-text-primary text-sm font-medium">Uploads</span>
          {queuedCount > 0 && (
            <span className="bg-accent/10 text-accent rounded-full px-1.5 py-0.5 text-xs font-medium">
              {queuedCount}
            </span>
          )}
          {failedCount > 0 && (
            <span className="bg-error/10 text-error rounded-full px-1.5 py-0.5 text-xs font-medium">
              {failedCount} failed
            </span>
          )}
          {pausedCount > 0 && (
            <span className="bg-warning/10 text-warning rounded-full px-1.5 py-0.5 text-xs font-medium">
              {pausedCount} paused
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearCompleted}
            className="text-text-tertiary hover:bg-surface-hover hover:text-text-primary rounded p-1 transition-colors"
            aria-label="Clear completed"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {items.map((item) => (
          <UploadQueueItem
            key={item.id}
            item={item}
            onCancel={() => cancelItem(item)}
            onPause={() => pauseItem(item)}
            onResume={() => resumeItem(item)}
            onRetry={() => resumeItem(item)}
            onRemove={() => removeItem(item.id)}
          />
        ))}
      </div>

      {!isOpen && hasItems && (
        <button
          onClick={() => setOpen(true)}
          className="border-border-muted text-text-tertiary hover:bg-surface-hover hover:text-text-primary flex w-full items-center justify-center gap-2 border-t px-4 py-2 text-xs transition-colors"
        >
          {queuedCount > 0
            ? `${String(queuedCount)} uploading`
            : failedCount > 0
              ? `${String(failedCount)} failed`
              : pausedCount > 0
                ? `${String(pausedCount)} paused`
                : "All complete"}
          <ChevronUp className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

function UploadQueueItem({
  item,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onRemove,
}: {
  item: UploadItem
  onCancel: () => void
  onPause: () => void
  onResume: () => void
  onRetry: () => void
  onRemove: () => void
}) {
  const doneChunks = item.chunks.filter((c) => c.status === "done").length
  const totalChunks = item.totalChunks ?? 0
  const showChunkProgress = totalChunks > 1 && item.status === "uploading"

  return (
    <div className="border-border-muted border-b px-4 py-2.5 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {item.status === "uploading" ? (
            <Loader2 className="text-accent h-5 w-5 animate-spin" />
          ) : item.status === "completed" ? (
            <CheckCircle className="text-success h-5 w-5" />
          ) : item.status === "failed" ? (
            <AlertCircle className="text-error h-5 w-5" />
          ) : item.status === "paused" ? (
            <Pause className="text-warning h-5 w-5" />
          ) : (
            <File className="text-text-tertiary h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-text-primary truncate text-sm">{item.fileName}</p>
            <span className="text-text-tertiary shrink-0 text-xs">{formatSize(item.fileSize)}</span>
          </div>

          {(item.status === "uploading" ||
            item.status === "queued" ||
            item.status === "preparing" ||
            item.status === "paused") && <ProgressBar value={item.progress} className="mt-1.5" />}

          {showChunkProgress && (
            <p className="text-text-tertiary mt-0.5 text-xs">
              Part {doneChunks}/{totalChunks} · {Math.round(item.progress)}%
            </p>
          )}

          {!showChunkProgress && item.status === "uploading" && (
            <p className="text-text-tertiary mt-0.5 text-xs">{Math.round(item.progress)}%</p>
          )}

          {item.status === "completed" && <p className="text-success mt-0.5 text-xs">Uploaded</p>}

          {item.status === "failed" && (
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-error text-xs">{item.error ?? "Failed"}</p>
              <button
                onClick={onRetry}
                className="text-accent hover:text-text-primary flex items-center gap-1 text-xs underline transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
              <button
                onClick={onRemove}
                className="text-text-tertiary hover:text-text-primary text-xs underline transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {item.status === "paused" && (
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-warning text-xs">Paused</p>
              <button
                onClick={onResume}
                className="text-accent hover:text-text-primary flex items-center gap-1 text-xs underline transition-colors"
              >
                <Play className="h-3 w-3" />
                Resume
              </button>
              <button
                onClick={onCancel}
                className="text-text-tertiary hover:text-text-primary text-xs underline transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {item.status === "queued" && (
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-text-tertiary text-xs">Waiting</p>
              <button
                onClick={onCancel}
                className="text-text-tertiary hover:text-text-primary text-xs underline transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {item.status === "preparing" && (
            <p className="text-text-tertiary mt-0.5 text-xs">Preparing folder structure</p>
          )}

          {item.status === "uploading" && (
            <div className="mt-0.5 flex items-center gap-2">
              <button
                onClick={onPause}
                className="text-text-tertiary hover:text-text-primary flex items-center gap-1 text-xs underline transition-colors"
              >
                <Pause className="h-3 w-3" />
                Pause
              </button>
              <button
                onClick={onCancel}
                className="text-text-tertiary hover:text-text-primary text-xs underline transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
