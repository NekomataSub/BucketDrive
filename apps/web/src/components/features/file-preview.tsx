/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { useCallback, useEffect, useState } from "react"
import { X, ChevronLeft, ChevronRight, FileText, Download } from "lucide-react"
import type { FileObject } from "@bucketdrive/shared"
import { usePreviewUrl } from "@/lib/api"

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const unit = units[i] ?? "GB"
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${unit}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString()
}

function getPreviewType(mimeType: string): "image" | "video" | "audio" | "pdf" | "markdown" | "text" | "unknown" {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("audio/")) return "audio"
  if (mimeType === "application/pdf") return "pdf"
  if (mimeType === "text/markdown" || mimeType === "text/x-markdown") return "markdown"
  if (mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/javascript" || mimeType === "text/csv") return "text"
  return "unknown"
}

function ImagePreview({ url, alt }: { url: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="flex h-full items-center justify-center bg-black/5 p-4 dark:bg-white/5">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}
      <img
        src={url}
        alt={alt}
        className="max-h-full max-w-full object-contain"
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

function VideoPreview({ url }: { url: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-black p-4">
      <video controls className="max-h-full max-w-full">
        <source src={url} />
        Your browser does not support the video tag.
      </video>
    </div>
  )
}

function AudioPreview({ url, fileName }: { url: string; fileName: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
        <FileText className="h-8 w-8 text-accent" />
      </div>
      <p className="text-sm font-medium text-text-primary">{fileName}</p>
      <audio controls className="w-full max-w-md">
        <source src={url} />
        Your browser does not support the audio tag.
      </audio>
    </div>
  )
}

function PdfPreview({ url }: { url: string }) {
  return (
    <div className="h-full w-full bg-surface-secondary">
      <iframe
        src={url}
        title="PDF Preview"
        className="h-full w-full border-0"
      />
    </div>
  )
}

function TextPreview({ url, mimeType }: { url: string; mimeType: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then((res) => res.text())
      .then((text) => {
        if (!cancelled) setContent(text)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-error">Failed to load text content</p>
      </div>
    )
  }

  if (content === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  const isMarkdown = mimeType === "text/markdown" || mimeType === "text/x-markdown"

  if (isMarkdown) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="space-y-2 text-sm leading-relaxed text-text-primary">
          {content.split("\n").map((line, index) => {
            if (line.startsWith("### ")) {
              return <h3 key={index} className="pt-3 text-lg font-semibold">{line.slice(4)}</h3>
            }
            if (line.startsWith("## ")) {
              return <h2 key={index} className="pt-4 text-xl font-semibold">{line.slice(3)}</h2>
            }
            if (line.startsWith("# ")) {
              return <h1 key={index} className="pt-5 text-2xl font-bold">{line.slice(2)}</h1>
            }
            if (!line.trim()) {
              return <div key={index} className="h-2" />
            }
            return <p key={index} className="whitespace-pre-wrap break-words">{line}</p>
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-4">
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-primary">
        {content}
      </pre>
    </div>
  )
}

function UnknownPreview({ file }: { file: FileObject }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-hover">
        <FileText className="h-10 w-10 text-text-tertiary" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-text-primary">{file.originalName}</p>
        <p className="mt-1 text-xs text-text-tertiary">{file.mimeType}</p>
      </div>
      <div className="w-full max-w-xs space-y-2 rounded-lg border border-border-default bg-surface-default p-4">
        <div className="flex justify-between text-xs">
          <span className="text-text-tertiary">Size</span>
          <span className="text-text-primary">{formatSize(file.sizeBytes)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-text-tertiary">Created</span>
          <span className="text-text-primary">{formatDate(file.createdAt)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-text-tertiary">Modified</span>
          <span className="text-text-primary">{formatDate(file.updatedAt)}</span>
        </div>
        {file.checksum && (
          <div className="flex justify-between text-xs">
            <span className="text-text-tertiary">Checksum</span>
            <span className="max-w-[120px] truncate text-text-primary font-mono">{file.checksum}</span>
          </div>
        )}
      </div>
    </div>
  )
}

interface FilePreviewProps {
  file: FileObject
  workspaceId: string
  hasNext: boolean
  hasPrev: boolean
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  onDownload: (fileId: string) => void
}

export function FilePreview({
  file,
  workspaceId,
  hasNext,
  hasPrev,
  onNext,
  onPrev,
  onClose,
  onDownload,
}: FilePreviewProps) {
  const { data: previewData, isLoading } = usePreviewUrl(workspaceId, file.id)
  const previewType = getPreviewType(file.mimeType)

  // Keyboard navigation inside preview
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault()
        onNext()
      }
      if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault()
        onPrev()
      }
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [hasNext, hasPrev, onNext, onPrev, onClose])

  const renderContent = useCallback(() => {
    if (isLoading || !previewData) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )
    }

    const url = previewData.signedUrl

    switch (previewType) {
      case "image":
        return <ImagePreview url={url} alt={file.originalName} />
      case "video":
        return <VideoPreview url={url} />
      case "audio":
        return <AudioPreview url={url} fileName={file.originalName} />
      case "pdf":
        return <PdfPreview url={url} />
      case "markdown":
      case "text":
        return <TextPreview url={url} mimeType={file.mimeType} />
      default:
        return <UnknownPreview file={file} />
    }
  }, [isLoading, previewData, previewType, file])

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface-default shadow-2xl md:w-[400px] lg:w-[480px]">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border-default px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{file.originalName}</p>
            <p className="text-[11px] text-text-tertiary">
              {file.mimeType} &middot; {formatSize(file.sizeBytes)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Previous file"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Next file"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => onDownload(file.id)}
              className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
              aria-label="Download file"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between border-t border-border-default px-4 py-2 text-[11px] text-text-tertiary">
          <span>Use arrow keys to navigate</span>
          <span>ESC to close</span>
        </div>
      </div>
    </>
  )
}
