import { Hono } from "hono"
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm"
import {
  DashboardAuditRequest,
  DashboardAuditResponse,
  DashboardOverviewResponse,
  DashboardSettingsResponse,
  UpdateDashboardSettingsRequest,
} from "@bucketdrive/shared"
import {
  auditLog,
  bucketSettings,
  fileObject,
  folder,
  shareLink,
  user,
} from "@bucketdrive/shared/db/schema"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { getDB } from "../../lib/db"
import { ensureBucketSettings } from "../../lib/bucket"
import { readUploadedBrandingImage, sanitizeAssetName } from "../../lib/branding-assets"
import { createStorageProvider } from "../../services/storage"
import { buildStorageTrend, parseAllowedMimeTypes } from "./dashboard.utils"

interface DashboardEnv {
  DB: D1Database
  STORAGE: R2Bucket
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  R2_BUCKET_NAME?: string
}

interface DashboardVariables {
  user: { id: string; email: string; name: string }
  session: { id: string; userId: string; expiresAt: Date }
}

const dashboard = new Hono<{ Bindings: DashboardEnv; Variables: DashboardVariables }>()

dashboard.use("*", authMiddleware)

dashboard.get("/overview", requirePermission("analytics.read"), async (c) => {
  const db = getDB()
  const settings = await ensureBucketSettings(db)
  const [
    fileCountRow,
    folderCountRow,
    shareCountRow,
    memberCountRow,
    usageRow,
    largestFiles,
    auditRows,
    storageRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(fileObject).where(eq(fileObject.isDeleted, false)).get(),
    db.select({ value: count() }).from(folder).where(eq(folder.isDeleted, false)).get(),
    db.select({ value: count() }).from(shareLink).where(eq(shareLink.isActive, true)).get(),
    db.select({ value: count() }).from(user).get(),
    db
      .select({ value: sql<number>`coalesce(sum(${fileObject.sizeBytes}), 0)` })
      .from(fileObject)
      .where(eq(fileObject.isDeleted, false))
      .get(),
    db
      .select({
        id: fileObject.id,
        folderId: fileObject.folderId,
        name: fileObject.originalName,
        sizeBytes: fileObject.sizeBytes,
        mimeType: fileObject.mimeType,
        createdAt: fileObject.createdAt,
      })
      .from(fileObject)
      .where(eq(fileObject.isDeleted, false))
      .orderBy(desc(fileObject.sizeBytes), desc(fileObject.createdAt))
      .limit(5)
      .all(),
    db
      .select({
        id: auditLog.id,
        actorId: auditLog.actorId,
        actorName: user.name,
        action: auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorId))
      .orderBy(desc(auditLog.createdAt))
      .limit(10)
      .all(),
    db
      .select({
        sizeBytes: fileObject.sizeBytes,
        createdAt: fileObject.createdAt,
        deletedAt: fileObject.deletedAt,
      })
      .from(fileObject)
      .all(),
  ])

  return c.json(
    DashboardOverviewResponse.parse({
      summary: {
        totalFiles: fileCountRow?.value ?? 0,
        totalFolders: folderCountRow?.value ?? 0,
        memberCount: memberCountRow?.value ?? 0,
        activeShares: shareCountRow?.value ?? 0,
        usedStorageBytes: usageRow?.value ?? 0,
        quotaBytes: settings.storageQuotaBytes,
      },
      storageTrend: buildStorageTrend(storageRows),
      largestFiles,
      recentActivity: auditRows,
    }),
  )
})

dashboard.get("/audit", requirePermission("audit.read"), async (c) => {
  const request = DashboardAuditRequest.parse({
    actorId: c.req.query("actorId") ?? undefined,
    action: c.req.query("action") ?? undefined,
    resourceType: c.req.query("resourceType") ?? undefined,
    from: c.req.query("from") ?? undefined,
    to: c.req.query("to") ?? undefined,
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  })
  const filters = []
  if (request.actorId) filters.push(eq(auditLog.actorId, request.actorId))
  if (request.action) filters.push(eq(auditLog.action, request.action))
  if (request.resourceType) filters.push(eq(auditLog.resourceType, request.resourceType))
  if (request.from) filters.push(gte(auditLog.createdAt, request.from))
  if (request.to) filters.push(lte(auditLog.createdAt, request.to))
  const whereClause = filters.length > 0 ? and(...filters) : undefined
  const offset = (request.page - 1) * request.limit
  const db = getDB()
  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(auditLog).where(whereClause).get(),
    db
      .select({
        id: auditLog.id,
        actorId: auditLog.actorId,
        actorName: user.name,
        action: auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
        ipAddress: auditLog.ipAddress,
        userAgent: auditLog.userAgent,
        metadata: auditLog.metadata,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorId))
      .where(whereClause)
      .orderBy(desc(auditLog.createdAt))
      .limit(request.limit)
      .offset(offset)
      .all(),
  ])
  return c.json(
    DashboardAuditResponse.parse({
      data: rows.map((row) => ({
        ...row,
        metadata: row.metadata ? safeParseMetadata(row.metadata) : null,
      })),
      meta: {
        page: request.page,
        limit: request.limit,
        total: totalRow?.value ?? 0,
        totalPages: Math.ceil((totalRow?.value ?? 0) / request.limit),
      },
    }),
  )
})

dashboard.get("/settings", requirePermission("bucket.settings.read"), async (c) => {
  return c.json(
    DashboardSettingsResponse.parse(toSettingsResponse(await ensureBucketSettings(getDB()))),
  )
})

dashboard.get("/settings/assets/logo", async (c) => {
  const settings = await ensureBucketSettings(getDB())
  const key = settings.brandingLogoKey
  if (!key) {
    return c.json({ code: "NOT_FOUND", message: "Asset not found" }, 404)
  }

  const object = await createStorageProvider(c.env).getObject(key)
  if (!object) return c.json({ code: "NOT_FOUND", message: "Asset not found" }, 404)

  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType ?? "application/octet-stream",
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=300",
    },
  })
})

dashboard.patch("/settings", requirePermission("bucket.settings.update"), async (c) => {
  const actor = c.get("user")
  const db = getDB()
  const body = UpdateDashboardSettingsRequest.parse(await c.req.json())
  const settings = await ensureBucketSettings(db)
  const now = new Date().toISOString()
  await db
    .update(bucketSettings)
    .set({
      storageQuotaBytes: body.storageQuotaBytes,
      defaultShareExpirationDays: body.defaultShareExpirationDays,
      enablePublicSignup: body.enablePublicSignup,
      trashRetentionDays: body.trashRetentionDays,
      maxFileSizeBytes: body.maxFileSizeBytes,
      uploadChunkSizeBytes: body.uploadChunkSizeBytes,
      allowedMimeTypes: JSON.stringify(body.allowedMimeTypes),
      brandingLogoUrl: body.brandingLogoUrl,
      brandingName: body.brandingName,
      r2PublicBaseUrl: normalizeBaseUrl(body.r2PublicBaseUrl),
      updatedAt: now,
    })
    .where(eq(bucketSettings.id, settings.id))
    .run()
  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      actorId: actor.id,
      action: "bucket.settings_updated",
      resourceType: "bucket",
      resourceId: settings.bucketId,
      metadata: JSON.stringify(body),
      createdAt: now,
    })
    .run()
  return c.json(DashboardSettingsResponse.parse(toSettingsResponse(await ensureBucketSettings(db))))
})

dashboard.post("/settings/assets/logo", requirePermission("bucket.settings.update"), async (c) => {
  const actor = c.get("user")
  const db = getDB()
  const settings = await ensureBucketSettings(db)
  const file = await readUploadedBrandingImage(c.req.raw)
  if ("error" in file) return c.json(file.error, file.status as never)

  const key = `branding/bucket/${settings.bucketId}/logo-${crypto.randomUUID()}-${sanitizeAssetName(file.name)}`
  await createStorageProvider(c.env).upload({
    key,
    body: await file.arrayBuffer(),
    contentType: file.type,
  })

  const now = new Date().toISOString()
  await db
    .update(bucketSettings)
    .set({
      brandingLogoKey: key,
      updatedAt: now,
    })
    .where(eq(bucketSettings.id, settings.id))
    .run()
  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      actorId: actor.id,
      action: "bucket.branding_logo_updated",
      resourceType: "bucket",
      resourceId: settings.bucketId,
      metadata: JSON.stringify({ key }),
      createdAt: now,
    })
    .run()

  return c.json(DashboardSettingsResponse.parse(toSettingsResponse(await ensureBucketSettings(db))))
})

function toSettingsResponse(settings: Awaited<ReturnType<typeof ensureBucketSettings>>) {
  return {
    ...settings,
    allowedMimeTypes: parseAllowedMimeTypes(settings.allowedMimeTypes),
    brandingLogoUrl: settings.brandingLogoUrl ?? null,
    brandingLogoAssetUrl: settings.brandingLogoKey
      ? `/api/shares/assets/branding-logo?v=${settings.updatedAt}`
      : null,
    brandingName: settings.brandingName ?? null,
    r2PublicBaseUrl: settings.r2PublicBaseUrl ?? null,
    r2LastSyncAt: settings.r2LastSyncAt ?? null,
    r2SyncError: settings.r2SyncError ?? null,
  }
}

function normalizeBaseUrl(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.replace(/\/+$/, "") : null
}

function safeParseMetadata(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { raw }
  }
}

export const dashboardHandler = dashboard
