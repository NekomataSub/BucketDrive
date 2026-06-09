import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { platformSettings } from "@bucketdrive/shared/db/schema"
import { getDB } from "../../lib/db"
import { ensureBucketSettings, getOrCreateDefaultBucket } from "../../lib/bucket"
import { authMiddleware } from "../../middleware/auth"

interface WorkspacesVariables {
  user: {
    id: string
    role: string
  }
}

const workspaces = new Hono<{ Variables: WorkspacesVariables }>()

workspaces.use("*", authMiddleware)

workspaces.get("/", async (c) => {
  const db = getDB()
  const currentUser = c.get("user")
  const [defaultBucket, settings, platform] = await Promise.all([
    getOrCreateDefaultBucket(db),
    ensureBucketSettings(db),
    db.select().from(platformSettings).where(eq(platformSettings.id, "default")).get(),
  ])
  const createdAt = defaultBucket.createdAt

  return c.json({
    data: [
      {
        id: defaultBucket.id,
        name: settings.brandingName ?? platform?.platformName ?? defaultBucket.name,
        slug: "bucket",
        ownerId: currentUser.id,
        role: currentUser.role,
        storageQuotaBytes: settings.storageQuotaBytes,
        createdAt,
        updatedAt: settings.updatedAt,
      },
    ],
  })
})

export const workspacesHandler = workspaces
