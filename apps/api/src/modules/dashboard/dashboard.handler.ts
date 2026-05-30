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
  fileObject,
  folder,
  member,
  shareLink,
  user,
  workspace,
  workspaceSettings,
} from "@bucketdrive/shared/db/schema"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { getDB } from "../../lib/db"
import { buildStorageTrend, parseAllowedMimeTypes } from "./dashboard.utils"
import { ensureOrganizationForWorkspace, syncWorkspaceMemberships } from "../../lib/workspace-membership"

interface DashboardEnv {
  DB: D1Database
}

interface DashboardVariables {
  user: { id: string; email: string; name: string }
  session: { id: string; userId: string; expiresAt: Date }
}

const dashboard = new Hono<{ Bindings: DashboardEnv; Variables: DashboardVariables }>()

dashboard.use("*", authMiddleware)

dashboard.get("/overview", requirePermission("analytics.read"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const db = getDB()
  await Promise.all([
    ensureOrganizationForWorkspace(db, workspaceId),
    syncWorkspaceMemberships(db, workspaceId),
    ensureWorkspaceSettingsRow(db, workspaceId),
  ])

  const [workspaceRow, fileCountRow, folderCountRow, shareCountRow, memberCountRow, usageRow, largestFiles, auditRows, storageRows] =
    await Promise.all([
      db.select().from(workspace).where(eq(workspace.id, workspaceId)).get(),
      db
        .select({ value: count() })
        .from(fileObject)
        .where(and(eq(fileObject.workspaceId, workspaceId), eq(fileObject.isDeleted, false)))
        .get(),
      db
        .select({ value: count() })
        .from(folder)
        .where(and(eq(folder.workspaceId, workspaceId), eq(folder.isDeleted, false)))
        .get(),
      db
        .select({ value: count() })
        .from(shareLink)
        .where(and(eq(shareLink.workspaceId, workspaceId), eq(shareLink.isActive, true)))
        .get(),
      db
        .select({ value: count() })
        .from(member)
        .where(eq(member.organizationId, workspaceId))
        .get(),
      db
        .select({
          value: sql<number>`coalesce(sum(${fileObject.sizeBytes}), 0)`,
        })
        .from(fileObject)
        .where(and(eq(fileObject.workspaceId, workspaceId), eq(fileObject.isDeleted, false)))
        .get(),
      db
        .select({
          id: fileObject.id,
          name: fileObject.originalName,
          sizeBytes: fileObject.sizeBytes,
          mimeType: fileObject.mimeType,
          createdAt: fileObject.createdAt,
        })
        .from(fileObject)
        .where(and(eq(fileObject.workspaceId, workspaceId), eq(fileObject.isDeleted, false)))
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
        .where(eq(auditLog.workspaceId, workspaceId))
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
        .where(eq(fileObject.workspaceId, workspaceId))
        .all(),
    ])

  if (!workspaceRow) {
    return c.json({ code: "WORKSPACE_NOT_FOUND", message: "Workspace not found" }, 404)
  }

  return c.json(
    DashboardOverviewResponse.parse({
      summary: {
        totalFiles: fileCountRow?.value ?? 0,
        totalFolders: folderCountRow?.value ?? 0,
        memberCount: memberCountRow?.value ?? 0,
        activeShares: shareCountRow?.value ?? 0,
        usedStorageBytes: usageRow?.value ?? 0,
        quotaBytes: workspaceRow.storageQuotaBytes,
      },
      storageTrend: buildStorageTrend(storageRows),
      largestFiles,
      recentActivity: auditRows,
    }),
  )
})

dashboard.get("/audit", requirePermission("audit.read"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const request = DashboardAuditRequest.parse({
    actorId: c.req.query("actorId") ?? undefined,
    action: c.req.query("action") ?? undefined,
    resourceType: c.req.query("resourceType") ?? undefined,
    from: c.req.query("from") ?? undefined,
    to: c.req.query("to") ?? undefined,
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  })

  const filters = [eq(auditLog.workspaceId, workspaceId)]
  if (request.actorId) filters.push(eq(auditLog.actorId, request.actorId))
  if (request.action) filters.push(eq(auditLog.action, request.action))
  if (request.resourceType) filters.push(eq(auditLog.resourceType, request.resourceType))
  if (request.from) filters.push(gte(auditLog.createdAt, request.from))
  if (request.to) filters.push(lte(auditLog.createdAt, request.to))

  const offset = (request.page - 1) * request.limit
  const db = getDB()
  const whereClause = filters.length === 1 ? filters[0] : and(...filters)

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(auditLog).where(whereClause).get(),
    db
      .select({
        id: auditLog.id,
        workspaceId: auditLog.workspaceId,
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

dashboard.get("/settings", requirePermission("workspace.settings.read"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const settings = await getWorkspaceSettings(getDB(), workspaceId)
  if (!settings) {
    return c.json({ code: "WORKSPACE_NOT_FOUND", message: "Workspace not found" }, 404)
  }

  return c.json(DashboardSettingsResponse.parse(settings))
})

dashboard.patch("/settings", requirePermission("workspace.settings.update"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400)
  }

  const actor = c.get("user")
  const db = getDB()
  const body = UpdateDashboardSettingsRequest.parse(await c.req.json())
  const existing = await getWorkspaceSettings(db, workspaceId)

  if (!existing) {
    return c.json({ code: "WORKSPACE_NOT_FOUND", message: "Workspace not found" }, 404)
  }

  const now = new Date().toISOString()

  await db
    .update(workspace)
    .set({
      storageQuotaBytes: body.storageQuotaBytes,
      updatedAt: now,
    })
    .where(eq(workspace.id, workspaceId))
    .run()

  await db
    .update(workspaceSettings)
    .set({
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
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .run()

  await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      actorId: actor.id,
      action: "workspace.settings_updated",
      resourceType: "workspace",
      resourceId: workspaceId,
      metadata: JSON.stringify(body),
      createdAt: now,
    })
    .run()

  const updated = await getWorkspaceSettings(db, workspaceId)
  return c.json(DashboardSettingsResponse.parse(updated))
})

async function ensureWorkspaceSettingsRow(db: ReturnType<typeof getDB>, workspaceId: string) {
  const currentWorkspace = await db.select().from(workspace).where(eq(workspace.id, workspaceId)).get()
  if (!currentWorkspace) {
    return null
  }

  const existing = await db
    .select({ id: workspaceSettings.id })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .get()

  if (!existing) {
    const now = new Date().toISOString()
    await db
      .insert(workspaceSettings)
      .values({
        id: crypto.randomUUID(),
        workspaceId,
        allowedMimeTypes: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }

  return currentWorkspace
}

async function getWorkspaceSettings(db: ReturnType<typeof getDB>, workspaceId: string) {
  await ensureWorkspaceSettingsRow(db, workspaceId)

  const row = await db
    .select({
      id: workspaceSettings.id,
      workspaceId: workspaceSettings.workspaceId,
      defaultShareExpirationDays: workspaceSettings.defaultShareExpirationDays,
      enablePublicSignup: workspaceSettings.enablePublicSignup,
      trashRetentionDays: workspaceSettings.trashRetentionDays,
      maxFileSizeBytes: workspaceSettings.maxFileSizeBytes,
      uploadChunkSizeBytes: workspaceSettings.uploadChunkSizeBytes,
      storageQuotaBytes: workspace.storageQuotaBytes,
      allowedMimeTypes: workspaceSettings.allowedMimeTypes,
      brandingLogoUrl: workspaceSettings.brandingLogoUrl,
      brandingName: workspaceSettings.brandingName,
      r2PublicBaseUrl: workspaceSettings.r2PublicBaseUrl,
      r2LastSyncAt: workspaceSettings.r2LastSyncAt,
      r2SyncStatus: workspaceSettings.r2SyncStatus,
      r2SyncError: workspaceSettings.r2SyncError,
    })
    .from(workspaceSettings)
    .innerJoin(workspace, eq(workspace.id, workspaceSettings.workspaceId))
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .get()

  if (!row) {
    return null
  }

  return {
    ...row,
    allowedMimeTypes: parseAllowedMimeTypes(row.allowedMimeTypes),
    brandingLogoUrl: row.brandingLogoUrl ?? null,
    brandingName: row.brandingName ?? null,
    r2PublicBaseUrl: row.r2PublicBaseUrl ?? null,
    r2LastSyncAt: row.r2LastSyncAt ?? null,
    r2SyncStatus: row.r2SyncStatus,
    r2SyncError: row.r2SyncError ?? null,
  }
}

function normalizeBaseUrl(value: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, "")
}

function safeParseMetadata(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { raw }
  }
}

export const dashboardHandler = dashboard
