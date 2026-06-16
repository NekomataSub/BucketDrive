import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { DEFAULT_BRAND_NAME } from "@bucketdrive/shared/constants"
import {
  AcceptPlatformInvitationResponse,
  CreatePlatformInvitationRequest,
  CreatePlatformInvitationResponse,
  ListPlatformInvitationsResponse,
  PlatformJoinResponse,
  PlatformSettingsResponse,
  UpdatePlatformSettingsRequest,
  UpdatePlatformSettingsResponse,
  type WorkspaceRole,
} from "@bucketdrive/shared"
import { platformSettings } from "@bucketdrive/shared/db/schema"
import { getDB } from "../../lib/db"
import { authMiddleware } from "../../middleware/auth"
import { requirePlatformAdmin } from "../../middleware/platform-admin"
import { createStorageProvider } from "../../services/storage"
import { readUploadedBrandingImage, sanitizeAssetName } from "../../lib/branding-assets"
import { syncDefaultBucketName } from "../../lib/bucket"
import {
  acceptInvitation,
  createInvitation,
  inviteLink,
  listPendingInvitations,
} from "../members/invitation-service"

interface PlatformEnv {
  DB: D1Database
  STORAGE: R2Bucket
  APP_URL?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  R2_BUCKET_NAME?: string
}

interface PlatformVariables {
  user: {
    id: string
    email: string
    name: string
    isPlatformAdmin: boolean
    role: WorkspaceRole
  }
}

const platform = new Hono<{ Bindings: PlatformEnv; Variables: PlatformVariables }>()
const PLATFORM_SETTINGS_ID = "default"

platform.get("/me", authMiddleware, (c) => {
  const currentUser = c.get("user")
  return c.json({
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name,
    isPlatformAdmin: currentUser.isPlatformAdmin,
    role: currentUser.role,
  })
})

platform.get("/settings", async () => {
  return Response.json(
    PlatformSettingsResponse.parse(toPlatformSettingsResponse(await ensurePlatformSettings())),
  )
})

platform.get("/assets/:kind", async (c) => {
  const kind = parseAssetKind(c.req.param("kind"))
  if (!kind) return c.json({ code: "NOT_FOUND", message: "Asset not found" }, 404)

  const settings = await ensurePlatformSettings()
  const key = kind === "logo" ? settings.logoKey : settings.faviconKey
  if (!key) return c.json({ code: "NOT_FOUND", message: "Asset not found" }, 404)

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

platform.patch("/settings", authMiddleware, requirePlatformAdmin, async (c) => {
  const body = UpdatePlatformSettingsRequest.parse(await c.req.json())
  const settings = await ensurePlatformSettings()
  const nextPlatformName = body.platformName ?? settings.platformName
  const now = new Date().toISOString()
  await getDB()
    .update(platformSettings)
    .set({
      platformName: nextPlatformName,
      enablePublicSignup: body.enablePublicSignup ?? settings.enablePublicSignup,
      updatedAt: now,
    })
    .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID))
    .run()
  if (nextPlatformName !== settings.platformName) {
    await syncDefaultBucketName(getDB(), nextPlatformName)
  }

  return c.json(
    UpdatePlatformSettingsResponse.parse({
      success: true,
      settings: toPlatformSettingsResponse(await ensurePlatformSettings()),
    }),
  )
})

platform.post("/assets/:kind", authMiddleware, requirePlatformAdmin, async (c) => {
  const kind = parseAssetKind(c.req.param("kind"))
  if (!kind) return c.json({ code: "NOT_FOUND", message: "Asset not found" }, 404)

  const file = await readUploadedBrandingImage(c.req.raw)
  if ("error" in file) return c.json(file.error, file.status as never)

  const key = `branding/platform/${kind}-${crypto.randomUUID()}-${sanitizeAssetName(file.name)}`
  await createStorageProvider(c.env).upload({
    key,
    body: await file.arrayBuffer(),
    contentType: file.type,
  })

  const now = new Date().toISOString()
  await ensurePlatformSettings()
  await getDB()
    .update(platformSettings)
    .set({
      [kind === "logo" ? "logoKey" : "faviconKey"]: key,
      updatedAt: now,
    })
    .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID))
    .run()

  return c.json({
    success: true,
    settings: PlatformSettingsResponse.parse(
      toPlatformSettingsResponse(await ensurePlatformSettings()),
    ),
  })
})

platform.post("/join", authMiddleware, async (c) => {
  const settings = await ensurePlatformSettings()
  if (!settings.enablePublicSignup) {
    return c.json({ code: "FORBIDDEN", message: "Public signup is disabled" }, 403)
  }
  return c.json(PlatformJoinResponse.parse({ success: true, role: c.get("user").role }))
})

platform.get("/invitations", authMiddleware, requirePlatformAdmin, async (c) => {
  const db = getDB()
  const rows = await listPendingInvitations(db)

  return c.json(
    ListPlatformInvitationsResponse.parse({
      data: rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.status,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        inviteLink: inviteLink(c.env.APP_URL, row.token),
      })),
    }),
  )
})

platform.post("/invitations", authMiddleware, requirePlatformAdmin, async (c) => {
  const actor = c.get("user")
  const db = getDB()
  const body = CreatePlatformInvitationRequest.parse(await c.req.json())
  const result = await createInvitation(db, actor, body, c.env.APP_URL)
  if ("error" in result) return c.json(result.error.body, result.error.status)

  return c.json(
    CreatePlatformInvitationResponse.parse({
      id: result.raw.id,
      email: result.raw.email,
      role: result.raw.role,
      status: result.raw.status,
      expiresAt: result.raw.expiresAt,
      createdAt: result.raw.createdAt,
      inviteLink: result.data.inviteLink,
    }),
    201,
  )
})

platform.post("/invitations/:token/accept", authMiddleware, async (c) => {
  const result = await acceptInvitation(getDB(), c.req.param("token"), c.get("user"))
  if ("error" in result) return c.json(result.error.body, result.error.status)

  return c.json(AcceptPlatformInvitationResponse.parse(result.data))
})

async function ensurePlatformSettings() {
  const db = getDB()
  const existing = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID))
    .get()
  if (existing) return existing

  const now = new Date().toISOString()
  const created = {
    id: PLATFORM_SETTINGS_ID,
    platformName: DEFAULT_BRAND_NAME,
    enablePublicSignup: true,
    logoKey: null,
    faviconKey: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(platformSettings).values(created).run()
  return created
}

function toPlatformSettingsResponse(settings: Awaited<ReturnType<typeof ensurePlatformSettings>>) {
  return {
    platformName: settings.platformName,
    enablePublicSignup: settings.enablePublicSignup,
    platformLogoUrl: settings.logoKey ? `/api/platform/assets/logo?v=${settings.updatedAt}` : null,
    faviconUrl: settings.faviconKey ? `/api/platform/assets/favicon?v=${settings.updatedAt}` : null,
  }
}

function parseAssetKind(value: string | undefined): "logo" | "favicon" | null {
  return value === "logo" || value === "favicon" ? value : null
}

export const platformHandler = platform
