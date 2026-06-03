/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { useEffect, useRef } from "react"
import { usePreviewUrl, useThumbnailUrl, useUploadVideoThumbnail } from "@/lib/api"
import { extractVideoFrameFromUrl } from "@/lib/video-thumbnail"

interface FileThumbnailProps {
  workspaceId: string
  fileId: string
  mimeType: string
  thumbnailKey: string | null
  fallback: React.ReactNode
  className?: string
}

export function FileThumbnail({
  workspaceId,
  fileId,
  mimeType,
  thumbnailKey,
  fallback,
  className,
}: FileThumbnailProps) {
  const isVisual = mimeType.startsWith("image/") || mimeType.startsWith("video/")
  const isVideo = mimeType.startsWith("video/")
  const shouldFetchThumbnail = isVisual
  const { data, isLoading } = useThumbnailUrl(
    shouldFetchThumbnail ? workspaceId : null,
    shouldFetchThumbnail ? fileId : null,
  )
  const { data: previewData } = usePreviewUrl(
    isVideo && !thumbnailKey ? workspaceId : null,
    isVideo && !thumbnailKey ? fileId : null,
  )
  const uploadVideoThumbnail = useUploadVideoThumbnail(workspaceId)
  const generationStarted = useRef(false)

  useEffect(() => {
    generationStarted.current = false
  }, [fileId])

  useEffect(() => {
    if (!isVideo || thumbnailKey || generationStarted.current || !previewData?.signedUrl) {
      return
    }

    generationStarted.current = true
    let cancelled = false

    const generateThumbnail = async () => {
      const blob = await extractVideoFrameFromUrl(previewData.signedUrl)
      if (!blob || cancelled) return

      await uploadVideoThumbnail.mutateAsync({ fileId, blob })
    }

    void generateThumbnail().catch(() => {
      // Video thumbnail failures are non-critical; keep the file icon fallback.
    })

    return () => {
      cancelled = true
    }
  }, [fileId, isVideo, previewData?.signedUrl, thumbnailKey, uploadVideoThumbnail])

  if (!isVisual) return fallback

  if (isLoading) {
    return (
      <div className={`animate-pulse rounded-md bg-surface-hover ${className ?? ""}`}>
        {fallback}
      </div>
    )
  }

  if (!data?.signedUrl) return fallback

  return (
    <img
      src={data.signedUrl}
      alt=""
      className={`object-cover ${className ?? ""}`}
      loading="lazy"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none"
      }}
    />
  )
}
