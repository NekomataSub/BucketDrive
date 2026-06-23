import { createD1DB, getDB } from "../../api/src/lib/db"
import { createStorageProvider } from "../../api/src/services/storage"
import { ThumbnailService } from "../../api/src/services/thumbnail.service"
import { TrashService } from "../../api/src/services/trash.service"
import {
  SYSTEM_R2_SYNC_ACTOR_ID,
  syncAllR2Workspaces,
} from "../../api/src/services/r2-import.service"

interface Env {
  DB: D1Database
  STORAGE: R2Bucket
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  R2_BUCKET_NAME?: string
}

export default {
  fetch() {
    return new Response("bucketdrive-workers", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    })
  },

  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledJobs(env))
  },
}

async function runScheduledJobs(env: Env) {
  createD1DB(env.DB)

  const results = await Promise.allSettled([runTrashCleanup(env), runR2Sync(env)])

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("Scheduled job failed:", result.reason)
    }
  }

  try {
    await runThumbnailBackfill(env)
  } catch (err) {
    console.warn("Scheduled job failed:", err)
  }
}

async function runThumbnailBackfill(env: Env) {
  const thumbnailService = new ThumbnailService({ storage: createStorageProvider(env) })
  const result = await thumbnailService.processPending({ limit: 25 })

  console.warn(
    [
      `Thumbnail backfill completed: scanned=${String(result.scanned)}`,
      `generated=${String(result.generated)}`,
      `skipped=${String(result.skipped)}`,
      `failed=${String(result.failed)}`,
    ].join(" "),
  )
}

async function runTrashCleanup(env: Env) {
  const storage = createStorageProvider(env)
  const trashService = new TrashService(getDB(), storage)
  const result = await trashService.purgeExpiredTrash("system")

  console.warn(
    `Trash cleanup completed: purgedFiles=${String(result.purgedFiles)} purgedFolders=${String(result.purgedFolders)}`,
  )
}

async function runR2Sync(env: Env) {
  const storage = createStorageProvider(env)
  const result = await syncAllR2Workspaces({
    storage,
    userId: SYSTEM_R2_SYNC_ACTOR_ID,
  })

  console.warn(
    [
      `R2 sync completed: workspaces=${String(result.workspaces)}`,
      `synced=${String(result.synced)}`,
      `skippedWorkspaces=${String(result.skippedWorkspaces)}`,
      `failedWorkspaces=${String(result.failedWorkspaces)}`,
      `scanned=${String(result.scanned)}`,
      `imported=${String(result.imported)}`,
      `updated=${String(result.updated)}`,
      `trashed=${String(result.deleted)}`,
      `skippedObjects=${String(result.skipped)}`,
      `failedObjects=${String(result.failed)}`,
    ].join(" "),
  )
}
