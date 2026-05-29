import { eq, and, inArray, ne, sql, type SQL } from "drizzle-orm"
import { getDB } from "../../lib/db"
import {
  shareLink,
  sharePermission,
  shareAccessAttempt,
  fileObject,
  folder,
  auditLog,
  user,
  workspaceSettings,
} from "@bucketdrive/shared/db/schema"
import { buildPublicObjectUrl, type StorageProvider } from "../../services/storage"
import { NotificationsService } from "../notifications/notifications.service"
import { can, ShareLinkSchema } from "@bucketdrive/shared"
import type {
  ShareDashboardItem,
  ShareLink,
  SharesListScope,
  WorkspaceRole,
} from "@bucketdrive/shared"

const encoder = new TextEncoder()
const SHARE_PASSWORD_ITERATIONS = 120_000

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: SHARE_PASSWORD_ITERATIONS,
    },
    key,
    256,
  )
  return `pbkdf2:${String(SHARE_PASSWORD_ITERATIONS)}:${toHex(salt)}:${toHex(new Uint8Array(hashBuffer))}`
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(":")
  if (parts[0] === "pbkdf2") {
    const [, iterationsRaw, saltHex, hashHex] = parts
    const iterations = Number(iterationsRaw)
    if (!iterations || !saltHex || !hashHex) return false

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    )
    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
      salt: toArrayBuffer(fromHex(saltHex)),
        iterations,
      },
      key,
      256,
    )
    return toHex(new Uint8Array(hashBuffer)) === hashHex
  }

  const [saltHex, hashHex] = parts
  if (!saltHex || !hashHex) return false
  const data = encoder.encode(password + saltHex)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return toHex(new Uint8Array(hashBuffer)) === hashHex
}

export interface CreateShareParams {
  workspaceId: string
  userId: string
  resourceType: "file" | "folder"
  resourceId: string
  shareType: "internal" | "external_direct" | "external_explorer"
  password?: string
  expiresAt?: string
  permissions?: ("read" | "download")[]
}

export interface ListSharesParams {
  workspaceId: string
  userId: string
  role: WorkspaceRole
  page: number
  limit: number
  q?: string
  scope: SharesListScope
}

export interface UpdateShareParams {
  shareId: string
  workspaceId: string
  userId: string
  role: WorkspaceRole
  password?: string | null
  expiresAt?: string | null
  isActive?: boolean
}

export interface RevokeShareParams {
  shareId: string
  workspaceId: string
  userId: string
  role: WorkspaceRole
}

export class SharesService {
  private async recordAudit(params: {
    workspaceId: string
    actorId: string
    action: string
    resourceId: string
    metadata?: Record<string, unknown>
    ipAddress?: string
    userAgent?: string
  }) {
    const db = getDB()
    await db
      .insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        workspaceId: params.workspaceId,
        actorId: params.actorId,
        action: params.action,
        resourceType: "share",
        resourceId: params.resourceId,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        createdAt: new Date().toISOString(),
      })
      .run()
  }

  async createShare(params: CreateShareParams): Promise<ShareLink> {
    const db = getDB()
    const now = new Date().toISOString()

    const resource = await this.findResource(params.workspaceId, params.resourceType, params.resourceId)
    if (!resource) {
      throw new ShareError("NOT_FOUND", `${params.resourceType} not found`)
    }

    const id = crypto.randomUUID()
    let passwordHash: string | null = null
    if (params.password) {
      passwordHash = await hashPassword(params.password)
    }

    await db
      .insert(shareLink)
      .values({
        id,
        workspaceId: params.workspaceId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        shareType: params.shareType,
        createdBy: params.userId,
        passwordHash,
        expiresAt: params.expiresAt ?? null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    if (params.permissions && params.permissions.length > 0) {
      for (const perm of params.permissions) {
        await db
          .insert(sharePermission)
          .values({
            id: crypto.randomUUID(),
            shareLinkId: id,
            permission: perm,
          })
          .run()
      }
    }

    await this.recordAudit({
      workspaceId: params.workspaceId,
      actorId: params.userId,
      action: "share.created",
      resourceId: id,
      metadata: {
        shareType: params.shareType,
        resourceType: params.resourceType,
        sharedResourceId: params.resourceId,
      },
    })

    const created = await db.select().from(shareLink).where(eq(shareLink.id, id)).get()
    if (!created) {
      throw new ShareError("INTERNAL_ERROR", "Failed to create share")
    }

    return ShareLinkSchema.parse(created)
  }

  async listShares(params: ListSharesParams) {
    const db = getDB()
    const canManageAll = can(params.role, "shares.manage_all")
    const effectiveScope =
      params.scope === "workspace" && !canManageAll ? "mine" : params.scope

    const conditions: SQL[] = [eq(shareLink.workspaceId, params.workspaceId)]

    if (effectiveScope === "shared_with_me") {
      conditions.push(eq(shareLink.shareType, "internal"))
      conditions.push(ne(shareLink.createdBy, params.userId))
      conditions.push(eq(shareLink.isActive, true))
    } else if (effectiveScope === "mine" || !canManageAll) {
      conditions.push(eq(shareLink.createdBy, params.userId))
    }

    const rows = await db
      .select()
      .from(shareLink)
      .where(and(...conditions))
      .orderBy(sql`${shareLink.createdAt} desc`)
      .all()

    const shareIds = rows.map((row) => row.id)
    const creatorIds = Array.from(new Set(rows.map((row) => row.createdBy)))
    const fileIds = rows.filter((row) => row.resourceType === "file").map((row) => row.resourceId)
    const folderIds = rows.filter((row) => row.resourceType === "folder").map((row) => row.resourceId)

    const permissionRows =
      shareIds.length > 0
        ? await db
            .select({
              shareLinkId: sharePermission.shareLinkId,
              permission: sharePermission.permission,
            })
            .from(sharePermission)
            .where(inArray(sharePermission.shareLinkId, shareIds))
            .all()
        : []

    const creatorRows =
      creatorIds.length > 0
        ? await db
            .select({
              id: user.id,
              name: user.name,
            })
            .from(user)
            .where(inArray(user.id, creatorIds))
            .all()
        : []

    const fileRows =
      fileIds.length > 0
        ? await db
            .select({
              id: fileObject.id,
              name: fileObject.originalName,
            })
            .from(fileObject)
            .where(inArray(fileObject.id, fileIds))
            .all()
        : []

    const folderRows =
      folderIds.length > 0
        ? await db
            .select({
              id: folder.id,
              name: folder.name,
            })
            .from(folder)
            .where(inArray(folder.id, folderIds))
            .all()
        : []

    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const lockRows =
      shareIds.length > 0
        ? await db
            .select({
              shareLinkId: shareAccessAttempt.shareLinkId,
              count: sql<number>`count(*)`,
            })
            .from(shareAccessAttempt)
            .where(
              and(
                inArray(shareAccessAttempt.shareLinkId, shareIds),
                eq(shareAccessAttempt.success, false),
                sql`${shareAccessAttempt.attemptedAt} >= ${thirtyMinAgo}`,
              ),
            )
            .groupBy(shareAccessAttempt.shareLinkId)
            .all()
        : []

    const creatorNameById = new Map(creatorRows.map((row) => [row.id, row.name]))
    const resourceNameById = new Map([
      ...fileRows.map((row) => [row.id, row.name] as const),
      ...folderRows.map((row) => [row.id, row.name] as const),
    ])
    const permissionsByShareId = new Map<string, Array<"read" | "download">>()
    for (const row of permissionRows) {
      const current = permissionsByShareId.get(row.shareLinkId) ?? []
      permissionsByShareId.set(row.shareLinkId, [...current, row.permission as "read" | "download"])
    }
    const lockCountByShareId = new Map(lockRows.map((row) => [row.shareLinkId, row.count]))

    const mapped: ShareDashboardItem[] = rows.map((row) => ({
      ...ShareLinkSchema.parse(row),
      resourceName: resourceNameById.get(row.resourceId) ?? "Deleted resource",
      createdByName: creatorNameById.get(row.createdBy) ?? "Unknown user",
      permissions: permissionsByShareId.get(row.id) ?? [],
      hasPassword: row.passwordHash !== null,
      isLocked: (lockCountByShareId.get(row.id) ?? 0) >= 10,
    }))

    const q = params.q?.trim().toLowerCase()
    const filtered = q
      ? mapped.filter((share) =>
          share.resourceName.toLowerCase().includes(q) ||
          share.createdByName.toLowerCase().includes(q),
        )
      : mapped

    const total = filtered.length
    const start = (params.page - 1) * params.limit
    const data = filtered.slice(start, start + params.limit)

    return {
      data,
      meta: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
        scope: effectiveScope,
        currentUserRole: params.role,
        canManageAll,
      },
    }
  }

  async getShare(shareId: string): Promise<ShareLink | null> {
    const db = getDB()
    const row = await db.select().from(shareLink).where(eq(shareLink.id, shareId)).get()
    return row ? ShareLinkSchema.parse(row) : null
  }

  async getSharePermissions(shareId: string): Promise<string[]> {
    const db = getDB()
    const rows = await db
      .select({ permission: sharePermission.permission })
      .from(sharePermission)
      .where(eq(sharePermission.shareLinkId, shareId))
      .all()
    return rows.map((r) => r.permission)
  }

  async updateShare(params: UpdateShareParams): Promise<ShareLink> {
    const db = getDB()
    const now = new Date().toISOString()

    const existing = await db
      .select()
      .from(shareLink)
      .where(and(eq(shareLink.id, params.shareId), eq(shareLink.workspaceId, params.workspaceId)))
      .get()

    if (!existing) {
      throw new ShareError("SHARE_NOT_FOUND", "Share not found")
    }

    if (!this.canManageShare(params.role, existing.createdBy, params.userId)) {
      throw new ShareError("FORBIDDEN", "Cannot update this share")
    }

    const updateSet: Record<string, unknown> = { updatedAt: now }

    if (params.password !== undefined) {
      if (params.password === null) {
        updateSet.passwordHash = null
      } else {
        updateSet.passwordHash = await hashPassword(params.password)
      }
    }

    if (params.expiresAt !== undefined) {
      updateSet.expiresAt = params.expiresAt
    }

    if (params.isActive !== undefined) {
      updateSet.isActive = params.isActive
    }

    await db.update(shareLink).set(updateSet).where(eq(shareLink.id, params.shareId)).run()

    await this.recordAudit({
      workspaceId: params.workspaceId,
      actorId: params.userId,
      action: "share.updated",
      resourceId: params.shareId,
      metadata: updateSet,
    })

    const updated = await db.select().from(shareLink).where(eq(shareLink.id, params.shareId)).get()
    if (!updated) {
      throw new ShareError("SHARE_NOT_FOUND", "Share not found after update")
    }

    return ShareLinkSchema.parse(updated)
  }

  async revokeShare(params: RevokeShareParams): Promise<void> {
    const db = getDB()
    const now = new Date().toISOString()

    const existing = await db
      .select()
      .from(shareLink)
      .where(and(eq(shareLink.id, params.shareId), eq(shareLink.workspaceId, params.workspaceId)))
      .get()

    if (!existing) {
      throw new ShareError("SHARE_NOT_FOUND", "Share not found")
    }

    if (!this.canManageShare(params.role, existing.createdBy, params.userId)) {
      throw new ShareError("FORBIDDEN", "Cannot revoke this share")
    }

    await db
      .update(shareLink)
      .set({ isActive: false, updatedAt: now })
      .where(eq(shareLink.id, params.shareId))
      .run()

    await this.recordAudit({
      workspaceId: params.workspaceId,
      actorId: params.userId,
      action: "share.revoked",
      resourceId: params.shareId,
    })
  }

  private async checkShareRateLimit(shareId: string, ipAddress?: string): Promise<void> {
    const db = getDB()
    const now = Date.now()
    const fifteenMinAgo = new Date(now - 15 * 60 * 1000).toISOString()
    const thirtyMinAgo = new Date(now - 30 * 60 * 1000).toISOString()

    if (ipAddress) {
      const ipFailuresRow = await db
        .select({ count: sql<number>`count(*)` })
        .from(shareAccessAttempt)
        .where(
          and(
            eq(shareAccessAttempt.shareLinkId, shareId),
            eq(shareAccessAttempt.ipAddress, ipAddress),
            eq(shareAccessAttempt.success, false),
            sql`${shareAccessAttempt.attemptedAt} >= ${fifteenMinAgo}`,
          ),
        )
        .get()
      const ipFailures = ipFailuresRow ? ipFailuresRow.count : 0

      if (ipFailures >= 5) {
        throw new ShareError("SHARE_PASSWORD_RATE_LIMITED", "Too many failed attempts from this IP. Try again in 15 minutes.")
      }
    }

    const totalFailuresRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(shareAccessAttempt)
      .where(
        and(
          eq(shareAccessAttempt.shareLinkId, shareId),
          eq(shareAccessAttempt.success, false),
          sql`${shareAccessAttempt.attemptedAt} >= ${thirtyMinAgo}`,
        ),
      )
      .get()
    const totalFailures = totalFailuresRow ? totalFailuresRow.count : 0

    if (totalFailures >= 10) {
      throw new ShareError("SHARE_LOCKED", "This share link has been temporarily locked due to too many failed attempts. Try again in 30 minutes.")
    }
  }

  async accessShare(
    shareId: string,
    storage: StorageProvider,
    options?: { password?: string; ipAddress?: string; userAgent?: string; downloadOnly?: boolean },
  ) {
    const db = getDB()
    const now = new Date().toISOString()

    const share = await db.select().from(shareLink).where(eq(shareLink.id, shareId)).get()

    if (!share) {
      throw new ShareError("SHARE_NOT_FOUND", "Share link not found")
    }

    if (!share.isActive) {
      throw new ShareError("SHARE_REVOKED", "This share link has been revoked")
    }

    if (share.expiresAt && share.expiresAt < now) {
      throw new ShareError("SHARE_EXPIRED", "This share link has expired")
    }

    if (options?.downloadOnly && share.shareType !== "external_direct") {
      throw new ShareError("INVALID_RESOURCE", "Direct download is only available for external file shares")
    }

    if (share.passwordHash) {
      const password = options?.password
      const ipAddress = options?.ipAddress
      const userAgent = options?.userAgent

      await this.checkShareRateLimit(shareId, ipAddress)

      if (!password) {
        throw new ShareError("PASSWORD_REQUIRED", "Password is required")
      }
      const valid = await verifyPassword(password, share.passwordHash)
      if (!valid) {
        if (ipAddress) {
          await db
            .insert(shareAccessAttempt)
            .values({
              id: crypto.randomUUID(),
              shareLinkId: shareId,
              ipAddress,
              userAgent: userAgent ?? null,
              success: false,
              attemptedAt: now,
            })
            .run()
        }
        await this.recordAudit({
          workspaceId: share.workspaceId,
          actorId: "public",
          action: "share.password_failed",
          resourceId: shareId,
          ipAddress,
          userAgent,
          metadata: {
            shareType: share.shareType,
          },
        })

        const recentFailuresRow = await db
          .select({ count: sql<number>`count(*)` })
          .from(shareAccessAttempt)
          .where(
            and(
              eq(shareAccessAttempt.shareLinkId, shareId),
              eq(shareAccessAttempt.success, false),
              sql`${shareAccessAttempt.attemptedAt} >= ${new Date(Date.now() - 30 * 60 * 1000).toISOString()}`,
            ),
          )
          .get()
        const recentFailures = recentFailuresRow ? recentFailuresRow.count : 0

        if (recentFailures === 10) {
          await this.recordAudit({
            workspaceId: share.workspaceId,
            actorId: "public",
            action: "share.locked",
            resourceId: shareId,
            ipAddress,
            userAgent,
            metadata: {
              reason: "too_many_failed_password_attempts",
            },
          })

          const notifications = new NotificationsService()
          await notifications.createNotification({
            userId: share.createdBy,
            workspaceId: share.workspaceId,
            type: "share.locked",
            title: "Share link locked",
            message: "One of your password-protected share links has been temporarily locked due to too many failed access attempts.",
            data: { shareId, resourceType: share.resourceType, resourceId: share.resourceId },
          })
        }
        throw new ShareError("INVALID_PASSWORD", "Invalid password")
      }
    }

    const resourceType = share.resourceType as "file" | "folder"
    let resourceName: string
    let signedUrl: string | null = null
    let publicUrl: string | null = null
    let files: Array<{ id: string; name: string; mimeType: string; sizeBytes: number }> = []
    let folders: Array<{ id: string; name: string }> = []

    let downloadIncrement = 0

    if (resourceType === "file") {
      const file = await db
        .select()
        .from(fileObject)
        .where(and(eq(fileObject.id, share.resourceId), eq(fileObject.workspaceId, share.workspaceId), eq(fileObject.isDeleted, false)))
        .get()

      if (!file) {
        throw new ShareError("NOT_FOUND", "Shared file no longer exists")
      }

      resourceName = file.originalName
      signedUrl = await storage.generateSignedDownloadUrl(file.storageKey, 900, {
        filename: file.originalName,
      })
      const settings = await db
        .select({ r2PublicBaseUrl: workspaceSettings.r2PublicBaseUrl })
        .from(workspaceSettings)
        .where(eq(workspaceSettings.workspaceId, share.workspaceId))
        .get()
      publicUrl = buildPublicObjectUrl(settings?.r2PublicBaseUrl, file.storageKey)
      downloadIncrement = 1
    } else {
      if (options?.downloadOnly) {
        throw new ShareError("INVALID_RESOURCE", "Direct download is only available for file shares")
      }

      const f = await db
        .select()
        .from(folder)
        .where(and(eq(folder.id, share.resourceId), eq(folder.workspaceId, share.workspaceId), eq(folder.isDeleted, false)))
        .get()

      if (!f) {
        throw new ShareError("NOT_FOUND", "Shared folder no longer exists")
      }

      resourceName = f.name

      const folderFiles = await db
        .select()
        .from(fileObject)
        .where(
          and(
            eq(fileObject.workspaceId, share.workspaceId),
            eq(fileObject.folderId, share.resourceId),
            eq(fileObject.isDeleted, false),
          ),
        )
        .all()

      files = folderFiles.map((ff) => ({
        id: ff.id,
        name: ff.originalName,
        mimeType: ff.mimeType,
        sizeBytes: ff.sizeBytes,
      }))

      const subFolders = await db
        .select()
        .from(folder)
        .where(
          and(
            eq(folder.workspaceId, share.workspaceId),
            eq(folder.parentFolderId, share.resourceId),
            eq(folder.isDeleted, false),
          ),
        )
        .all()

      folders = subFolders.map((sf) => ({ id: sf.id, name: sf.name }))
    }

    await db
      .update(shareLink)
      .set({
        accessCount: share.accessCount + 1,
        downloadCount: share.downloadCount + downloadIncrement,
        lastAccessedAt: now,
        updatedAt: now,
      })
      .where(eq(shareLink.id, shareId))
      .run()

    if (options?.ipAddress) {
      await db
        .insert(shareAccessAttempt)
        .values({
          id: crypto.randomUUID(),
          shareLinkId: shareId,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent ?? null,
          success: true,
          attemptedAt: now,
        })
        .run()
    }

    await this.recordAudit({
      workspaceId: share.workspaceId,
      actorId: "public",
      action: "share.accessed",
      resourceId: shareId,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      metadata: {
        shareType: share.shareType,
        resourceType,
        mode: resourceType === "file" ? "download" : "folder_root",
      },
    })

    const branding = await this.getWorkspaceBranding(share.workspaceId)

    return {
      resourceType,
      resourceName,
      signedUrl,
      publicUrl: publicUrl ?? undefined,
      files,
      folders,
      ...branding,
    }
  }

  private async findResource(
    workspaceId: string,
    resourceType: "file" | "folder",
    resourceId: string,
  ) {
    const db = getDB()
    if (resourceType === "file") {
      return db
        .select()
        .from(fileObject)
        .where(and(eq(fileObject.id, resourceId), eq(fileObject.workspaceId, workspaceId), eq(fileObject.isDeleted, false)))
        .get()
    }
    return db
      .select()
      .from(folder)
      .where(and(eq(folder.id, resourceId), eq(folder.workspaceId, workspaceId), eq(folder.isDeleted, false)))
      .get()
  }

  private canManageShare(role: WorkspaceRole, createdBy: string, userId: string): boolean {
    return createdBy === userId || can(role, "shares.manage_all")
  }

  private async getWorkspaceBranding(workspaceId: string): Promise<{ brandingLogoUrl: string | null; brandingName: string | null }> {
    const db = getDB()
    const settings = await db
      .select({
        brandingLogoUrl: workspaceSettings.brandingLogoUrl,
        brandingName: workspaceSettings.brandingName,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .get()
    return {
      brandingLogoUrl: settings?.brandingLogoUrl ?? null,
      brandingName: settings?.brandingName ?? null,
    }
  }

  async getShareInfo(shareId: string) {
    const db = getDB()
    const share = await db.select().from(shareLink).where(eq(shareLink.id, shareId)).get()

    if (!share) {
      throw new ShareError("SHARE_NOT_FOUND", "Share link not found")
    }

    let resourceName: string
    if (share.resourceType === "file") {
      const file = await db
        .select()
        .from(fileObject)
        .where(and(eq(fileObject.id, share.resourceId), eq(fileObject.workspaceId, share.workspaceId)))
        .get()
      resourceName = file?.originalName ?? "Unknown file"
    } else {
      const f = await db
        .select()
        .from(folder)
        .where(and(eq(folder.id, share.resourceId), eq(folder.workspaceId, share.workspaceId)))
        .get()
      resourceName = f?.name ?? "Unknown folder"
    }

    const branding = await this.getWorkspaceBranding(share.workspaceId)

    return {
      id: share.id,
      resourceType: share.resourceType as "file" | "folder",
      resourceName,
      shareType: share.shareType as "internal" | "external_direct" | "external_explorer",
      hasPassword: share.passwordHash !== null,
      isActive: share.isActive,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
      ...branding,
    }
  }

  async browseShare(
    shareId: string,
    folderId: string | null,
    options?: { password?: string; ipAddress?: string; userAgent?: string },
  ) {
    const db = getDB()
    const now = new Date().toISOString()

    const share = await db.select().from(shareLink).where(eq(shareLink.id, shareId)).get()

    if (!share) {
      throw new ShareError("SHARE_NOT_FOUND", "Share link not found")
    }

    if (!share.isActive) {
      throw new ShareError("SHARE_REVOKED", "This share link has been revoked")
    }

    if (share.expiresAt && share.expiresAt < now) {
      throw new ShareError("SHARE_EXPIRED", "This share link has expired")
    }

    if (share.resourceType !== "folder") {
      throw new ShareError("INVALID_RESOURCE", "Browse is only available for folder shares")
    }

    if (share.passwordHash) {
      const password = options?.password
      const ipAddress = options?.ipAddress
      const userAgent = options?.userAgent

      await this.checkShareRateLimit(shareId, ipAddress)

      if (!password) {
        throw new ShareError("PASSWORD_REQUIRED", "Password is required")
      }
      const valid = await verifyPassword(password, share.passwordHash)
      if (!valid) {
        if (ipAddress) {
          await db
            .insert(shareAccessAttempt)
            .values({
              id: crypto.randomUUID(),
              shareLinkId: shareId,
              ipAddress,
              userAgent: userAgent ?? null,
              success: false,
              attemptedAt: now,
            })
            .run()
        }
        await this.recordAudit({
          workspaceId: share.workspaceId,
          actorId: "public",
          action: "share.password_failed",
          resourceId: shareId,
          ipAddress,
          userAgent,
          metadata: {
            shareType: share.shareType,
          },
        })

        const recentFailuresRow = await db
          .select({ count: sql<number>`count(*)` })
          .from(shareAccessAttempt)
          .where(
            and(
              eq(shareAccessAttempt.shareLinkId, shareId),
              eq(shareAccessAttempt.success, false),
              sql`${shareAccessAttempt.attemptedAt} >= ${new Date(Date.now() - 30 * 60 * 1000).toISOString()}`,
            ),
          )
          .get()
        const recentFailures = recentFailuresRow ? recentFailuresRow.count : 0

        if (recentFailures === 10) {
          await this.recordAudit({
            workspaceId: share.workspaceId,
            actorId: "public",
            action: "share.locked",
            resourceId: shareId,
            ipAddress,
            userAgent,
            metadata: {
              reason: "too_many_failed_password_attempts",
            },
          })

          const notifications = new NotificationsService()
          await notifications.createNotification({
            userId: share.createdBy,
            workspaceId: share.workspaceId,
            type: "share.locked",
            title: "Share link locked",
            message: "One of your password-protected share links has been temporarily locked due to too many failed access attempts.",
            data: { shareId, resourceType: share.resourceType, resourceId: share.resourceId },
          })
        }
        throw new ShareError("INVALID_PASSWORD", "Invalid password")
      }
    }

    const targetFolderId = folderId ?? share.resourceId
    const targetFolder = await db
      .select()
      .from(folder)
      .where(and(eq(folder.id, targetFolderId), eq(folder.workspaceId, share.workspaceId), eq(folder.isDeleted, false)))
      .get()

    if (!targetFolder) {
      throw new ShareError("NOT_FOUND", "Folder not found")
    }

    let currentId: string | null = targetFolderId
    const breadcrumbs: Array<{ id: string; name: string }> = []

    while (currentId) {
      const f = await db
        .select()
        .from(folder)
        .where(and(eq(folder.id, currentId), eq(folder.workspaceId, share.workspaceId), eq(folder.isDeleted, false)))
        .get()

      if (!f) break
      breadcrumbs.unshift({ id: f.id, name: f.name })

      if (currentId === share.resourceId) break
      currentId = f.parentFolderId ?? null
    }

    const rootBreadcrumb = breadcrumbs[0]
    if (!rootBreadcrumb || rootBreadcrumb.id !== share.resourceId) {
      throw new ShareError("NOT_FOUND", "Folder is not within the shared scope")
    }

    const folderFiles = await db
      .select()
      .from(fileObject)
      .where(
        and(
          eq(fileObject.workspaceId, share.workspaceId),
          eq(fileObject.folderId, targetFolderId),
          eq(fileObject.isDeleted, false),
        ),
      )
      .all()

    const subFolders = await db
      .select()
      .from(folder)
      .where(
        and(
          eq(folder.workspaceId, share.workspaceId),
          eq(folder.parentFolderId, targetFolderId),
          eq(folder.isDeleted, false),
        ),
      )
      .all()

    await db
      .update(shareLink)
      .set({
        accessCount: share.accessCount + 1,
        lastAccessedAt: now,
        updatedAt: now,
      })
      .where(eq(shareLink.id, shareId))
      .run()

    if (options?.ipAddress) {
      await db
        .insert(shareAccessAttempt)
        .values({
          id: crypto.randomUUID(),
          shareLinkId: shareId,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent ?? null,
          success: true,
          attemptedAt: now,
        })
        .run()
    }

    await this.recordAudit({
      workspaceId: share.workspaceId,
      actorId: "public",
      action: "share.accessed",
      resourceId: shareId,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      metadata: {
        shareType: share.shareType,
        resourceType: share.resourceType,
        mode: "browse",
        currentFolderId: targetFolderId,
      },
    })

    const branding = await this.getWorkspaceBranding(share.workspaceId)

    return {
      resourceName: targetFolder.name,
      currentFolderId: targetFolderId === share.resourceId ? null : targetFolderId,
      breadcrumbs,
      files: folderFiles.map((ff) => ({
        id: ff.id,
        name: ff.originalName,
        mimeType: ff.mimeType,
        sizeBytes: ff.sizeBytes,
      })),
      folders: subFolders.map((sf) => ({ id: sf.id, name: sf.name })),
      ...branding,
    }
  }
}

export class ShareError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = "ShareError"
  }
}
