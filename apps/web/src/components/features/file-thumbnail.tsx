/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { useThumbnailUrl } from "@/lib/api"

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
  const shouldFetchThumbnail = isVisual && Boolean(thumbnailKey)
  const { data, isLoading } = useThumbnailUrl(
    shouldFetchThumbnail ? workspaceId : null,
    shouldFetchThumbnail ? fileId : null,
  )

  if (!isVisual) return fallback
  if (!thumbnailKey) return fallback

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
