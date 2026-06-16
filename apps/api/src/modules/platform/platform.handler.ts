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
import { getD1Binding, getDB } from "../../lib/db"
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
const DEFAULT_LANGUAGE = "en-US"

interface PlatformSettingsRow {
  id: string
  platformName: string
  enablePublicSignup: boolean
  defaultLanguage?: string | null
  logoKey: string | null
  faviconKey: string | null
  createdAt: string
  updatedAt: string
}

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
      defaultLanguage: body.defaultLanguage ?? settings.defaultLanguage ?? DEFAULT_LANGUAGE,
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
  const existing = await readPlatformSettingsRow()
  if (existing) return existing

  const now = new Date().toISOString()
  const db = getDB()
  const created = {
    id: PLATFORM_SETTINGS_ID,
    platformName: DEFAULT_BRAND_NAME,
    enablePublicSignup: true,
    defaultLanguage: DEFAULT_LANGUAGE,
    logoKey: null,
    faviconKey: null,
    createdAt: now,
    updatedAt: now,
  }
  if (await hasPlatformSettingsColumn("default_language")) {
    await db.insert(platformSettings).values(created).run()
  } else {
    await getD1Binding()
      .prepare(
        `insert into platform_settings
          (id, platform_name, enable_public_signup, logo_key, favicon_key, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        created.id,
        created.platformName,
        created.enablePublicSignup ? 1 : 0,
        created.logoKey,
        created.faviconKey,
        created.createdAt,
        created.updatedAt,
      )
      .run()
  }
  return created
}

function toPlatformSettingsResponse(settings: Awaited<ReturnType<typeof ensurePlatformSettings>>) {
  const defaultLanguage = settings.defaultLanguage === "pt-BR" ? "pt-BR" : DEFAULT_LANGUAGE

  return {
    platformName: settings.platformName,
    enablePublicSignup: settings.enablePublicSignup,
    defaultLanguage,
    platformLogoUrl: settings.logoKey ? `/api/platform/assets/logo?v=${settings.updatedAt}` : null,
    faviconUrl: settings.faviconKey ? `/api/platform/assets/favicon?v=${settings.updatedAt}` : null,
  }
}

async function readPlatformSettingsRow(): Promise<PlatformSettingsRow | null> {
  const d1 = getD1Binding()
  const hasDefaultLanguage = await hasPlatformSettingsColumn("default_language")
  const defaultLanguageSelect = hasDefaultLanguage ? "default_language" : "'en-US'"
  const row = await d1
    .prepare(
      `select id,
        platform_name as platformName,
        enable_public_signup as enablePublicSignup,
        ${defaultLanguageSelect} as defaultLanguage,
        logo_key as logoKey,
        favicon_key as faviconKey,
        created_at as createdAt,
        updated_at as updatedAt
      from platform_settings
      where id = ?
      limit 1`,
    )
    .bind(PLATFORM_SETTINGS_ID)
    .first<Record<string, unknown>>()

  if (!row) return null

  return {
    id: String(row.id),
    platformName: String(row.platformName),
    enablePublicSignup: Boolean(row.enablePublicSignup),
    defaultLanguage:
      typeof row.defaultLanguage === "string" ? row.defaultLanguage : DEFAULT_LANGUAGE,
    logoKey: typeof row.logoKey === "string" ? row.logoKey : null,
    faviconKey: typeof row.faviconKey === "string" ? row.faviconKey : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  }
}

async function hasPlatformSettingsColumn(columnName: string): Promise<boolean> {
  const columnsResult: unknown = await getD1Binding()
    .prepare("pragma table_info(platform_settings)")
    .all()
  if (typeof columnsResult !== "object" || columnsResult === null) return false

  const results = (columnsResult as { results?: unknown }).results
  if (!Array.isArray(results)) return false

  return results.some((row) => {
    if (typeof row !== "object" || row === null) return false
    return (row as { name?: unknown }).name === columnName
  })
}

function parseAssetKind(value: string | undefined): "logo" | "favicon" | null {
  return value === "logo" || value === "favicon" ? value : null
}

export const platformHandler = platform
