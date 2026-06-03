export async function extractVideoFrame(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("video/")) return null

  return extractVideoFrameFromSource(URL.createObjectURL(file), true)
}

export async function extractVideoFrameFromUrl(url: string): Promise<Blob | null> {
  return extractVideoFrameFromSource(url, false)
}

async function extractVideoFrameFromSource(src: string, revokeSource: boolean): Promise<Blob | null> {
  const video = document.createElement("video")
  video.crossOrigin = "anonymous"
  video.muted = true
  video.playsInline = true
  video.preload = "metadata"

  return new Promise<Blob | null>((resolve) => {
    const cleanup = () => {
      if (revokeSource) {
        URL.revokeObjectURL(video.src)
      }
    }

    video.addEventListener("loadeddata", () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 1
      const seekTime = Math.min(0.5, duration / 2)
      video.currentTime = seekTime
    })

    video.addEventListener("seeked", () => {
      const canvas = document.createElement("canvas")
      const maxDimension = 256
      const ratio = Math.min(maxDimension / video.videoWidth, maxDimension / video.videoHeight)
      canvas.width = Math.round(video.videoWidth * ratio)
      canvas.height = Math.round(video.videoHeight * ratio)

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        cleanup()
        resolve(null)
        return
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          cleanup()
          resolve(blob)
        },
        "image/webp",
        0.85,
      )
    })

    video.addEventListener("error", () => {
      cleanup()
      resolve(null)
    })

    video.src = src
    video.load()
  })
}
