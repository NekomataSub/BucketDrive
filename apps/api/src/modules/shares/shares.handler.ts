import { Hono } from "hono"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { getDB } from "../../lib/db"
import { createStorageProvider } from "../../services/storage"
import {
  CreateShareRequest,
  ListSharesRequest,
  ListSharesResponse,
  UpdateShareRequest,
  ShareAccessRequest,
  ShareAccessResponse,
  ShareInfoResponse,
  ShareBrowseRequest,
  ShareBrowseResponse,
  type WorkspaceRole,
} from "@bucketdrive/shared"
import { SharesService, ShareError } from "./shares.service"
import { getWorkspaceRoleForUser } from "../../lib/workspace-membership"

interface SharesEnv {
  STORAGE: R2Bucket
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  R2_BUCKET_NAME?: string
  DB: D1Database
}

interface SharesVariables {
  user: { id: string; email: string; name: string }
}

const shares = new Hono<{ Bindings: SharesEnv; Variables: SharesVariables }>()

shares.use("*", authMiddleware)

shares.get("/", requirePermission("shares.read"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400 as never)
  }

  const user = c.get("user")
  const db = getDB()
  const role: WorkspaceRole = (await getWorkspaceRoleForUser(db, workspaceId, user.id)) ?? "viewer"
  const request = ListSharesRequest.parse({
    scope:
      c.req.query("scope") ??
      (c.req.query("sharedWithMe") === "true" ? "shared_with_me" : "mine"),
    q: c.req.query("q") ?? undefined,
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  })

  const service = new SharesService()
  const result = await service.listShares({
    workspaceId,
    userId: user.id,
    role,
    page: request.page,
    limit: request.limit,
    q: request.q,
    scope: request.scope,
  })

  return c.json(
    ListSharesResponse.parse({
      data: result.data,
      meta: result.meta,
    }),
  )
})

shares.post("/", requirePermission("shares.create"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  if (!workspaceId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId is required" }, 400 as never)
  }

  const user = c.get("user")
  const body = CreateShareRequest.parse(await c.req.json())

  const service = new SharesService()
  try {
    const result = await service.createShare({
      workspaceId,
      userId: user.id,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      shareType: body.shareType,
      password: body.password,
      expiresAt: body.expiresAt,
      permissions: body.permissions,
    })
    return c.json(result, 201)
  } catch (err) {
    if (err instanceof ShareError) {
      return c.json({ code: err.code, message: err.message }, 400 as never)
    }
    throw err
  }
})

shares.patch("/:shareId", requirePermission("shares.update"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const shareId = c.req.param("shareId")
  if (!workspaceId || !shareId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and shareId are required" }, 400 as never)
  }

  const user = c.get("user")
  const body = UpdateShareRequest.parse(await c.req.json())
  const db = getDB()
  const role: WorkspaceRole = (await getWorkspaceRoleForUser(db, workspaceId, user.id)) ?? "viewer"

  const service = new SharesService()
  try {
    const result = await service.updateShare({
      shareId,
      workspaceId,
      userId: user.id,
      role,
      password: body.password,
      expiresAt: body.expiresAt,
      isActive: body.isActive,
    })
    return c.json(result)
  } catch (err) {
    if (err instanceof ShareError) {
      const statusMap: Record<string, number> = {
        SHARE_NOT_FOUND: 404,
        FORBIDDEN: 403,
      }
      const status = statusMap[err.code] ?? 400
      return c.json({ code: err.code, message: err.message }, status as never)
    }
    throw err
  }
})

shares.delete("/:shareId", requirePermission("shares.revoke"), async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const shareId = c.req.param("shareId")
  if (!workspaceId || !shareId) {
    return c.json({ code: "VALIDATION_ERROR", message: "workspaceId and shareId are required" }, 400 as never)
  }

  const user = c.get("user")
  const db = getDB()
  const role: WorkspaceRole = (await getWorkspaceRoleForUser(db, workspaceId, user.id)) ?? "viewer"

  const service = new SharesService()
  try {
    await service.revokeShare({ shareId, workspaceId, userId: user.id, role })
    return c.json({ success: true, shareId })
  } catch (err) {
    if (err instanceof ShareError) {
      const statusMap: Record<string, number> = {
        SHARE_NOT_FOUND: 404,
        FORBIDDEN: 403,
      }
      const status = statusMap[err.code] ?? 400
      return c.json({ code: err.code, message: err.message }, status as never)
    }
    throw err
  }
})

const publicShares = new Hono<{ Bindings: SharesEnv }>()

publicShares.get("/:shareId", async (c) => {
  const shareId = c.req.param("shareId")
  if (!shareId) {
    return c.json({ code: "VALIDATION_ERROR", message: "shareId is required" }, 400 as never)
  }

  const service = new SharesService()
  try {
    const result = await service.getShareInfo(shareId)
    return c.json(ShareInfoResponse.parse(result))
  } catch (err) {
    if (err instanceof ShareError) {
      const statusMap: Record<string, number> = {
        SHARE_NOT_FOUND: 404,
      }
      const status = statusMap[err.code] ?? 400
      return c.json({ code: err.code, message: err.message }, status as never)
    }
    throw err
  }
})

publicShares.post("/:shareId/access", async (c) => {
  const shareId = c.req.param("shareId")
  if (!shareId) {
    return c.json({ code: "VALIDATION_ERROR", message: "shareId is required" }, 400 as never)
  }

  const body = ShareAccessRequest.parse(await c.req.json())
  const storage = createStorageProvider(c.env)
  const ipAddress = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown"
  const userAgent = c.req.header("User-Agent") ?? undefined

  const service = new SharesService()
  try {
    const result = await service.accessShare(shareId, storage, {
      password: body.password,
      ipAddress,
      userAgent,
    })
    return c.json(ShareAccessResponse.parse(result))
  } catch (err) {
    if (err instanceof ShareError) {
      const statusMap: Record<string, number> = {
        SHARE_NOT_FOUND: 404,
        SHARE_REVOKED: 410,
        SHARE_EXPIRED: 410,
        PASSWORD_REQUIRED: 401,
        INVALID_PASSWORD: 403,
        SHARE_LOCKED: 423,
        SHARE_PASSWORD_RATE_LIMITED: 429,
        NOT_FOUND: 404,
      }
      const status = statusMap[err.code] ?? 400
      return c.json({ code: err.code, message: err.message }, status as never)
    }
    throw err
  }
})

publicShares.get("/:shareId/download", async (c) => {
  const shareId = c.req.param("shareId")
  if (!shareId) {
    return c.json({ code: "VALIDATION_ERROR", message: "shareId is required" }, 400 as never)
  }

  const storage = createStorageProvider(c.env)
  const ipAddress = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown"
  const userAgent = c.req.header("User-Agent") ?? undefined

  const service = new SharesService()
  try {
    const result = await service.accessShare(shareId, storage, {
      ipAddress,
      userAgent,
      downloadOnly: true,
    })

    if (result.resourceType !== "file" || !result.signedUrl) {
      return c.json({ code: "INVALID_RESOURCE", message: "Direct download is only available for file shares" }, 400 as never)
    }

    return c.redirect(result.signedUrl, 302)
  } catch (err) {
    if (err instanceof ShareError) {
      const statusMap: Record<string, number> = {
        SHARE_NOT_FOUND: 404,
        SHARE_REVOKED: 410,
        SHARE_EXPIRED: 410,
        PASSWORD_REQUIRED: 401,
        INVALID_PASSWORD: 403,
        SHARE_LOCKED: 423,
        SHARE_PASSWORD_RATE_LIMITED: 429,
        NOT_FOUND: 404,
        INVALID_RESOURCE: 400,
      }
      const status = statusMap[err.code] ?? 400
      return c.json({ code: err.code, message: err.message }, status as never)
    }
    throw err
  }
})

publicShares.get("/:shareId/browse", async (c) => {
  const shareId = c.req.param("shareId")
  if (!shareId) {
    return c.json({ code: "VALIDATION_ERROR", message: "shareId is required" }, 400 as never)
  }

  const folderId = c.req.query("folderId") ?? null
  const ipAddress = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown"
  const userAgent = c.req.header("User-Agent") ?? undefined

  const service = new SharesService()
  try {
    const result = await service.browseShare(shareId, folderId, {
      ipAddress,
      userAgent,
    })
    return c.json(ShareBrowseResponse.parse(result))
  } catch (err) {
    if (err instanceof ShareError) {
      const statusMap: Record<string, number> = {
        SHARE_NOT_FOUND: 404,
        SHARE_REVOKED: 410,
        SHARE_EXPIRED: 410,
        PASSWORD_REQUIRED: 401,
        INVALID_PASSWORD: 403,
        SHARE_LOCKED: 423,
        SHARE_PASSWORD_RATE_LIMITED: 429,
        NOT_FOUND: 404,
        INVALID_RESOURCE: 400,
      }
      const status = statusMap[err.code] ?? 400
      return c.json({ code: err.code, message: err.message }, status as never)
    }
    throw err
  }
})

publicShares.post("/:shareId/browse", async (c) => {
  const shareId = c.req.param("shareId")
  if (!shareId) {
    return c.json({ code: "VALIDATION_ERROR", message: "shareId is required" }, 400 as never)
  }

  const body = ShareBrowseRequest.parse(await c.req.json())
  const ipAddress = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown"
  const userAgent = c.req.header("User-Agent") ?? undefined

  const service = new SharesService()
  try {
    const result = await service.browseShare(shareId, body.folderId ?? null, {
      password: body.password,
      ipAddress,
      userAgent,
    })
    return c.json(ShareBrowseResponse.parse(result))
  } catch (err) {
    if (err instanceof ShareError) {
      const statusMap: Record<string, number> = {
        SHARE_NOT_FOUND: 404,
        SHARE_REVOKED: 410,
        SHARE_EXPIRED: 410,
        PASSWORD_REQUIRED: 401,
        INVALID_PASSWORD: 403,
        SHARE_LOCKED: 423,
        SHARE_PASSWORD_RATE_LIMITED: 429,
        NOT_FOUND: 404,
        INVALID_RESOURCE: 400,
      }
      const status = statusMap[err.code] ?? 400
      return c.json({ code: err.code, message: err.message }, status as never)
    }
    throw err
  }
})

export const sharesHandler = shares
export const publicSharesHandler = publicShares
