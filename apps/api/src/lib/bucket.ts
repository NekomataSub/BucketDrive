import { eq } from "drizzle-orm"
import { DEFAULT_BRAND_NAME } from "@bucketdrive/shared/constants"
import { bucket, bucketSettings, platformSettings } from "@bucketdrive/shared/db/schema"
import type { getDB } from "./db"

type DB = ReturnType<typeof getDB>

const PLATFORM_SETTINGS_ID = "default"

export async function getOrCreateDefaultBucket(db: DB) {
  const bucketName = await getDefaultBucketName(db)
  const existing = await db.select().from(bucket).get()
  if (existing) {
    if (existing.name === bucketName) return existing

    await db.update(bucket).set({ name: bucketName }).where(eq(bucket.id, existing.id)).run()
    return { ...existing, name: bucketName }
  }

  const now = new Date().toISOString()
  const created = {
    id: crypto.randomUUID(),
    name: bucketName,
    provider: "r2",
    region: null,
    visibility: "private",
    createdAt: now,
  }

  await db.insert(bucket).values(created).run()
  return created
}

export async function syncDefaultBucketName(db: DB, name: string) {
  const existing = await db.select().from(bucket).get()
  if (!existing || existing.name === name) return existing

  await db.update(bucket).set({ name }).where(eq(bucket.id, existing.id)).run()
  return { ...existing, name }
}

export async function ensureBucketSettings(db: DB) {
  const defaultBucket = await getOrCreateDefaultBucket(db)
  const existing = await db
    .select()
    .from(bucketSettings)
    .where(eq(bucketSettings.bucketId, defaultBucket.id))
    .get()

  if (existing) return existing

  const now = new Date().toISOString()
  const created = {
    id: crypto.randomUUID(),
    bucketId: defaultBucket.id,
    storageQuotaBytes: 10 * 1024 * 1024 * 1024,
    defaultShareExpirationDays: 30,
    enablePublicSignup: false,
    trashRetentionDays: 30,
    maxFileSizeBytes: 5 * 1024 * 1024 * 1024,
    uploadChunkSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: JSON.stringify([]),
    brandingLogoUrl: null,
    brandingLogoKey: null,
    brandingName: null,
    r2PublicBaseUrl: null,
    r2LastSyncAt: null,
    r2SyncStatus: "idle",
    r2SyncError: null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(bucketSettings).values(created).run()
  return created
}

async function getDefaultBucketName(db: DB) {
  const settings = await db
    .select({ name: platformSettings.platformName })
    .from(platformSettings)
    .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID))
    .get()

  return settings?.name ?? DEFAULT_BRAND_NAME
}
