/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions */
import { useCallback, useRef } from "react"
import { useUploadStore, type UploadItem } from "@/stores/upload-store"
import {
  useInitiateUpload,
  useCompleteUpload,
  getUploadSession,
  useGetPartSignedUrls,
  useCancelUpload,
  useUploadVideoThumbnail,
} from "@/lib/api"
import { extractVideoFrame } from "@/lib/video-thumbnail"

const MAX_RETRIES = 3
const RETRY_BASE_DELAY = 1000
const MAX_CONCURRENT_CHUNKS = 4

export function useUploadProcessor(workspaceId: string) {
  const { items, updateItem, setOpen } = useUploadStore()
  const initiateMutation = useInitiateUpload()
  const completeMutation = useCompleteUpload()
  const getPartUrlsMutation = useGetPartSignedUrls(workspaceId)
  const cancelMutation = useCancelUpload(workspaceId)
  const videoThumbnailMutation = useUploadVideoThumbnail(workspaceId)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  const uploadChunk = useCallback(
    async (
      file: File,
      signedUrl: string,
      partNumber: number,
      chunkSize: number,
      abortSignal: AbortSignal,
    ): Promise<{ etag: string }> => {
      const start = (partNumber - 1) * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener("progress", () => {
          // Progress is tracked at the batch level
        })

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const etag = xhr.getResponseHeader("ETag") ?? `part-${partNumber}`
            resolve({ etag })
          } else {
            reject(new Error(`Chunk ${partNumber} failed with status ${xhr.status}`))
          }
        })

        xhr.addEventListener("error", () => reject(new Error(`Chunk ${partNumber} upload failed`)))
        xhr.addEventListener("abort", () => reject(new Error(`Chunk ${partNumber} cancelled`)))

        abortSignal.addEventListener("abort", () => {
          xhr.abort()
        })

        xhr.open("PUT", signedUrl)
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
        xhr.send(chunk)
      })
    },
    [],
  )

  const uploadChunksWithRetry = useCallback(
    async (
      item: UploadItem,
      signedUrls: Array<{ partNumber: number; signedUrl: string }>,
      chunkSize: number,
      abortSignal: AbortSignal,
    ): Promise<Array<{ partNumber: number; etag: string; sizeBytes: number }>> => {
      const file = item.file
      if (!file) {
        throw new Error("File handle lost")
      }
      const results: Array<{ partNumber: number; etag: string; sizeBytes: number }> = []

      await Promise.all(
        signedUrls.map(async ({ partNumber, signedUrl }) => {
          let lastError: Error | undefined

          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (abortSignal.aborted) {
              throw new Error("Upload cancelled")
            }

            try {
              const { etag } = await uploadChunk(
                file,
                signedUrl,
                partNumber,
                chunkSize,
                abortSignal,
              )

              const start = (partNumber - 1) * chunkSize
              const end = Math.min(start + chunkSize, item.fileSize)
              const sizeBytes = end - start

              updateItem(item.id, {
                chunks: item.chunks.map((c) =>
                  c.partNumber === partNumber ? { ...c, status: "done", etag } : c,
                ),
              })

              results.push({ partNumber, etag, sizeBytes })
              return
            } catch (err) {
              lastError = err instanceof Error ? err : new Error(String(err))

              if (attempt < MAX_RETRIES) {
                const delay = RETRY_BASE_DELAY * Math.pow(2, attempt)
                await new Promise((r) => setTimeout(r, delay))
              }
            }
          }

          updateItem(item.id, {
            chunks: item.chunks.map((c) =>
              c.partNumber === partNumber ? { ...c, status: "failed" } : c,
            ),
          })

          throw lastError ?? new Error(`Chunk ${partNumber} failed after ${MAX_RETRIES} retries`)
        }),
      )

      return results
    },
    [uploadChunk, updateItem],
  )

  const processMultipartUpload = useCallback(
    async (item: UploadItem, initiate: {
      uploadId: string
      sessionId: string
      partSize: number
      totalParts: number
      storageKey: string
    }) => {
      const { uploadId, sessionId, partSize, totalParts } = initiate

      updateItem(item.id, {
        uploadId,
        sessionId,
        storageKey: initiate.storageKey,
        totalChunks: totalParts,
        chunkSize: partSize,
        chunks: Array.from({ length: totalParts }, (_, i) => ({
          partNumber: i + 1,
          status: "pending" as const,
          sizeBytes: Math.min(partSize, item.fileSize - i * partSize),
        })),
        progress: 5,
      })

      // Check for resume: if item already has done chunks, sync with server
      const doneChunks = item.chunks.filter((c) => c.status === "done" && c.etag)
      if (doneChunks.length > 0 && sessionId) {
        try {
          const serverSession = await getUploadSession(workspaceId, sessionId)
          if (serverSession) {
            const serverDone = new Set(serverSession.completedParts.map((p) => p.partNumber))
            updateItem(item.id, {
              chunks: item.chunks.map((c) =>
                serverDone.has(c.partNumber) ? { ...c, status: "done" } : c,
              ),
            })
          }
        } catch {
          // Ignore resume sync errors, continue with local state
        }
      }

      const abortController = new AbortController()
      abortControllersRef.current.set(item.id, abortController)

      try {
        const allParts: Array<{ partNumber: number; etag: string; sizeBytes: number }> = []
        const pendingPartNumbers: number[] = []

        for (let i = 1; i <= totalParts; i++) {
          const chunk = item.chunks.find((c) => c.partNumber === i)
          if (!chunk || chunk.status !== "done") {
            pendingPartNumbers.push(i)
          } else if (chunk.etag) {
            allParts.push({ partNumber: i, etag: chunk.etag, sizeBytes: chunk.sizeBytes })
          }
        }

        for (let batchStart = 0; batchStart < pendingPartNumbers.length; batchStart += MAX_CONCURRENT_CHUNKS) {
          if (abortController.signal.aborted) {
            throw new Error("Upload cancelled")
          }

          const batch = pendingPartNumbers.slice(batchStart, batchStart + MAX_CONCURRENT_CHUNKS)

          updateItem(item.id, {
            chunks: item.chunks.map((c) =>
              batch.includes(c.partNumber) ? { ...c, status: "uploading" } : c,
            ),
          })

          const partUrls = await getPartUrlsMutation.mutateAsync({
            sessionId,
            partNumbers: batch,
          })

          const uploaded = await uploadChunksWithRetry(
            item,
            partUrls.signedUrls,
            partSize,
            abortController.signal,
          )

          allParts.push(...uploaded)

          const doneCountAfter = item.chunks.filter((c) => c.status === "done").length
          const progress = 5 + (doneCountAfter / totalParts) * 80
          updateItem(item.id, { progress })
        }

        updateItem(item.id, { progress: 90 })

        const sortedParts = allParts.sort((a, b) => a.partNumber - b.partNumber)
        const completedFile = await completeMutation.mutateAsync({
          workspaceId,
          uploadId,
          fileName: item.fileName,
          mimeType: item.mimeType,
          folderId: item.targetFolderId ?? null,
          parts: sortedParts,
        })

        if (item.mimeType.startsWith("video/") && item.file) {
          try {
            const frameBlob = await extractVideoFrame(item.file)
            if (frameBlob) {
              await videoThumbnailMutation.mutateAsync({
                fileId: completedFile.id,
                blob: frameBlob,
              })
            }
          } catch {
            // Video thumbnail failures are non-critical
          }
        }

        updateItem(item.id, { status: "completed", progress: 100 })
        return true
      } finally {
        abortControllersRef.current.delete(item.id)
      }
    },
    [
      workspaceId,
      updateItem,
      getPartUrlsMutation,
      uploadChunksWithRetry,
      completeMutation,
    ],
  )

  const processSingleUpload = useCallback(
    async (item: UploadItem, initiate: {
      uploadId: string
      signedUrl: string
      storageKey: string
    }) => {
      const file = item.file
      if (!file) {
        throw new Error("File handle lost")
      }
      const abortController = new AbortController()

      try {
        updateItem(item.id, {
          uploadId: initiate.uploadId,
          storageKey: initiate.storageKey,
          progress: 10,
        })

        await uploadWithProgress(
          file,
          initiate.signedUrl,
          (progress) => {
            updateItem(item.id, { progress: 10 + progress * 0.7 })
          },
          abortController.signal,
        )

        updateItem(item.id, { progress: 85 })

        const completedFile = await completeMutation.mutateAsync({
          workspaceId,
          uploadId: initiate.uploadId,
          fileName: item.fileName,
          mimeType: item.mimeType,
          folderId: item.targetFolderId ?? null,
        })

        if (item.mimeType.startsWith("video/") && item.file) {
          try {
            const frameBlob = await extractVideoFrame(item.file)
            if (frameBlob) {
              await videoThumbnailMutation.mutateAsync({
                fileId: completedFile.id,
                blob: frameBlob,
              })
            }
          } catch {
            // Video thumbnail failures are non-critical
          }
        }

        updateItem(item.id, { status: "completed", progress: 100 })
        return true
      } finally {
        abortControllersRef.current.delete(item.id)
      }
    },
    [workspaceId, updateItem, completeMutation],
  )

  const processItem = useCallback(
    async (item: UploadItem) => {
      if (item.status === "paused" || item.status === "cancelled") {
        return false
      }

      if (!item.file) {
        updateItem(item.id, {
          status: "failed",
          error: "File handle lost after page refresh. Please re-add the file.",
        })
        return false
      }

      updateItem(item.id, { status: "uploading", progress: 0, error: undefined })

      try {
        if (item.uploadId && item.sessionId && item.totalChunks && item.chunkSize) {
          return await processMultipartUpload(item, {
            uploadId: item.uploadId,
            sessionId: item.sessionId,
            partSize: item.chunkSize,
            totalParts: item.totalChunks,
            storageKey: item.storageKey ?? "",
          })
        }

        if (item.uploadId && item.signedUrl) {
          return await processSingleUpload(item, {
            uploadId: item.uploadId,
            signedUrl: item.signedUrl,
            storageKey: item.storageKey ?? "",
          })
        }

        const initiate = await initiateMutation.mutateAsync({
          workspaceId,
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.fileSize,
          folderId: item.targetFolderId ?? null,
        })

        if (initiate.sessionId && initiate.totalParts && initiate.partSize) {
          return await processMultipartUpload(item, {
            uploadId: initiate.uploadId,
            sessionId: initiate.sessionId,
            partSize: initiate.partSize,
            totalParts: initiate.totalParts,
            storageKey: initiate.storageKey,
          })
        }

        if (initiate.signedUrl) {
          return await processSingleUpload(item, {
            uploadId: initiate.uploadId,
            signedUrl: initiate.signedUrl,
            storageKey: initiate.storageKey,
          })
        }

        throw new Error("Invalid upload initiation response")
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed"
        updateItem(item.id, { status: "failed", error: message })
        return false
      }
    },
    [workspaceId, updateItem, initiateMutation, processMultipartUpload, processSingleUpload],
  )

  const cancelItem = useCallback(
    async (item: UploadItem) => {
      const controller = abortControllersRef.current.get(item.id)
      if (controller) {
        controller.abort()
      }

      if (item.sessionId) {
        try {
          await cancelMutation.mutateAsync({ sessionId: item.sessionId })
        } catch {
          // Ignore cancel errors
        }
      }

      updateItem(item.id, { status: "cancelled" })
    },
    [cancelMutation, updateItem],
  )

  const pauseItem = useCallback(
    (item: UploadItem) => {
      const controller = abortControllersRef.current.get(item.id)
      if (controller) {
        controller.abort()
      }
      updateItem(item.id, { status: "paused" })
    },
    [updateItem],
  )

  const resumeItem = useCallback(
    (item: UploadItem) => {
      if (item.status !== "paused" && item.status !== "failed") {
        return
      }
      updateItem(item.id, { status: "queued", retryCount: Number(item.retryCount) + 1 })
    },
    [updateItem],
  )

  const processQueue = useCallback(async () => {
    const queued = items.filter((i) => i.status === "queued")
    for (const item of queued) {
      await processItem(item)
    }
    const remaining = useUploadStore.getState().items.filter(
      (i) => i.status !== "completed" && i.status !== "failed" && i.status !== "cancelled",
    )
    if (remaining.length === 0) {
      setTimeout(() => setOpen(false), 5000)
    }
  }, [items, processItem, setOpen])

  return { processQueue, cancelItem, pauseItem, resumeItem }
}

function uploadWithProgress(
  file: File,
  url: string,
  onProgress: (progress: number) => void,
  abortSignal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total)
      }
    })

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    })

    xhr.addEventListener("error", () => reject(new Error("Upload failed")))
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")))

    abortSignal.addEventListener("abort", () => {
      xhr.abort()
    })

    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
    xhr.send(file)
  })
}
