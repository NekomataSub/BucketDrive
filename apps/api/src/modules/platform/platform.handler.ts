import { Hono } from "hono"
import { and, eq, gte } from "drizzle-orm"
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
import { bucketInvitation, platformSettings, user } from "@bucketdrive/shared/db/schema"
import { getDB } from "../../lib/db"
import { authMiddleware } from "../../middleware/auth"
import { requirePlatformAdmin } from "../../middleware/platform-admin"
import { createStorageProvider } from "../../services/storage"
import { readUploadedBrandingImage, sanitizeAssetName } from "../../lib/branding-assets"
import { syncDefaultBucketName } from "../../lib/bucket"

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
    role: string
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
  const rows = await db
    .select()
    .from(bucketInvitation)
    .where(
      and(
        eq(bucketInvitation.status, "pending"),
        gte(bucketInvitation.expiresAt, new Date().toISOString()),
      ),
    )
    .all()

  return c.json(
    ListPlatformInvitationsResponse.parse({
      data: rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.status,
        expiresAt: toIsoDateTime(row.expiresAt),
        createdAt: toIsoDateTime(row.createdAt),
        inviteLink: inviteLink(c.env.APP_URL, row.token),
      })),
    }),
  )
})

platform.post("/invitations", authMiddleware, requirePlatformAdmin, async (c) => {
  const actor = c.get("user")
  const db = getDB()
  const body = CreatePlatformInvitationRequest.parse(await c.req.json())
  const email = body.email.toLowerCase()

  const targetUser = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).get()
  if (targetUser) {
    return c.json({ code: "USER_ALREADY_MEMBER", message: "User already exists" }, 409)
  }

  const existingInvite = await db
    .select({ id: bucketInvitation.id })
    .from(bucketInvitation)
    .where(and(eq(bucketInvitation.email, email), eq(bucketInvitation.status, "pending")))
    .get()
  if (existingInvite) {
    return c.json(
      { code: "CONFLICT", message: "Pending invitation already exists for this email" },
      409,
    )
  }

  const now = new Date()
  const token = crypto.randomUUID()
  const created = {
    id: crypto.randomUUID(),
    email,
    token,
    role: body.role,
    invitedBy: actor.id,
    status: "pending",
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    acceptedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }

  await db.insert(bucketInvitation).values(created).run()

  return c.json(
    CreatePlatformInvitationResponse.parse({
      id: created.id,
      email: created.email,
      role: created.role,
      status: created.status,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
      inviteLink: inviteLink(c.env.APP_URL, token),
    }),
    201,
  )
})

platform.post("/invitations/:token/accept", authMiddleware, async (c) => {
  const db = getDB()
  const currentUser = c.get("user")
  const token = c.req.param("token")
  const now = new Date().toISOString()
  const invite = await db
    .select()
    .from(bucketInvitation)
    .where(and(eq(bucketInvitation.token, token), eq(bucketInvitation.status, "pending")))
    .get()

  if (!invite) {
    return c.json({ code: "NOT_FOUND", message: "Invitation not found or already used" }, 404)
  }

  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    await db
      .update(bucketInvitation)
      .set({ status: "expired", updatedAt: now })
      .where(eq(bucketInvitation.id, invite.id))
      .run()
    return c.json({ code: "SHARE_EXPIRED", message: "Invitation has expired" }, 410)
  }

  if (invite.email.toLowerCase() !== currentUser.email.toLowerCase()) {
    return c.json(
      { code: "FORBIDDEN", message: "This invitation is for a different email address" },
      403,
    )
  }

  await db
    .update(user)
    .set({ role: invite.role, updatedAt: now })
    .where(eq(user.id, currentUser.id))
    .run()
  await db
    .update(bucketInvitation)
    .set({ status: "accepted", acceptedAt: now, updatedAt: now })
    .where(eq(bucketInvitation.id, invite.id))
    .run()

  return c.json(
    AcceptPlatformInvitationResponse.parse({ success: true, role: invite.role as WorkspaceRole }),
  )
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

function inviteLink(appUrl: string | undefined, token: string) {
  const base = appUrl?.replace(/\/$/, "") ?? ""
  return `${base}/join?token=${token}`
}

function toIsoDateTime(value: string): string {
  const sqliteTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
  const normalized = sqliteTimestamp.test(value) ? `${value.replace(" ", "T")}Z` : value
  const date = new Date(normalized)

  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export const platformHandler = platform
