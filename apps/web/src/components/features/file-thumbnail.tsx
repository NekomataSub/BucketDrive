/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { useEffect, useRef, useState } from "react"
import { usePreviewUrl, useThumbnailUrl, useUploadVideoThumbnail } from "@/lib/api"
import { extractVideoFrameFromUrl } from "@/lib/video-thumbnail"

const BROWSER_THUMBNAIL_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/ogg"])

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
  const isImage = mimeType.startsWith("image/")
  const isVideo = mimeType.startsWith("video/")
  const isVisual = isImage || isVideo
  const canGenerateBrowserVideoThumbnail = BROWSER_THUMBNAIL_VIDEO_TYPES.has(mimeType)
  const shouldFetchThumbnail = isImage || (isVideo && Boolean(thumbnailKey))
  const { data, isLoading } = useThumbnailUrl(
    shouldFetchThumbnail ? workspaceId : null,
    shouldFetchThumbnail ? fileId : null,
  )
  const { data: previewData } = usePreviewUrl(
    isVideo && canGenerateBrowserVideoThumbnail && !thumbnailKey ? workspaceId : null,
    isVideo && canGenerateBrowserVideoThumbnail && !thumbnailKey ? fileId : null,
  )
  const uploadVideoThumbnail = useUploadVideoThumbnail(workspaceId)
  const generationStarted = useRef(false)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    generationStarted.current = false
  }, [fileId])

  useEffect(() => {
    setImageFailed(false)
  }, [fileId, data?.signedUrl])

  useEffect(() => {
    if (
      !isVideo ||
      !canGenerateBrowserVideoThumbnail ||
      thumbnailKey ||
      generationStarted.current ||
      !previewData?.signedUrl
    ) {
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
  }, [
    canGenerateBrowserVideoThumbnail,
    fileId,
    isVideo,
    previewData?.signedUrl,
    thumbnailKey,
    uploadVideoThumbnail,
  ])

  if (!isVisual) return fallback

  if (isLoading) {
    return (
      <div className={`bg-surface-hover animate-pulse rounded-md ${className ?? ""}`}>
        {fallback}
      </div>
    )
  }

  if (!data?.signedUrl || imageFailed) return fallback

  return (
    <img
      src={data.signedUrl}
      alt=""
      className={`object-cover ${className ?? ""}`}
      loading="lazy"
      onError={() => {
        setImageFailed(true)
      }}
    />
  )
}
