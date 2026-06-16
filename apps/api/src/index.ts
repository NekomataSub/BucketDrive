import { Hono } from "hono"
import { cors } from "hono/cors"
import { ZodError } from "zod"
import { securityHeaders } from "./middleware/security-headers"
import { createAuth } from "./lib/auth"
import { createD1DB } from "./lib/db"
import { filesHandler } from "./modules/files/files.handler"
import { foldersHandler } from "./modules/folders/folders.handler"
import { membersHandler } from "./modules/members/members.handler"
import { invitationsHandler, publicInvitationsHandler } from "./modules/members/invitations.handler"
import { searchHandler } from "./modules/search/search.handler"
import { dashboardHandler } from "./modules/dashboard/dashboard.handler"
import { sharesHandler, publicSharesHandler } from "./modules/shares/shares.handler"
import { tagsHandler } from "./modules/tags/tags.handler"
import { notificationsHandler } from "./modules/notifications/notifications.handler"
import { trashHandler } from "./modules/trash/trash.handler"
import { platformHandler } from "./modules/platform/platform.handler"
import { batchHandler } from "./modules/batch/batch.handler"
import {
  transferOwnershipHandler,
  workspacesHandler,
} from "./modules/workspaces/workspaces.handler"
import { authMiddleware } from "./middleware/auth"
import { requirePermission } from "./middleware/rbac"
import { getAllowedOrigins } from "./lib/origins"
import {
  e2eCreateFile,
  e2eCreateFilesBulk,
  e2eGetSession,
  e2eLogin,
  e2eSignOut,
} from "./lib/e2e-auth"

interface Env {
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  APP_URL?: string
  API_URL?: string
  DB: D1Database
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  STORAGE: R2Bucket
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  R2_BUCKET_NAME?: string
  E2E_TEST_AUTH?: string
}

const app = new Hono<{ Bindings: Env }>()

app.use("*", securityHeaders)
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      if (!origin) return null
      const env = c.env as Env
      return getAllowedOrigins(env).includes(origin) ? origin : null
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  }),
)

app.use("*", async (c, next) => {
  createD1DB(c.env.DB)
  await next()
})

app.post("/api/e2e/login", e2eLogin)
app.post("/api/e2e/files", e2eCreateFile)
app.post("/api/e2e/files/bulk", e2eCreateFilesBulk)
app.get("/api/auth/get-session", async (c, next) => {
  const response = await e2eGetSession(c)
  if (response) return response
  await next()
})
app.post("/api/auth/sign-out", async (c, next) => {
  const response = e2eSignOut(c)
  if (response) return response
  await next()
})

app.all("/api/auth/*", (c) => {
  const origin = c.req.header("origin") ?? undefined
  const auth = createAuth(c.env, origin)
  return auth.handler(c.req.raw)
})

app.get("/api/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }))

app.get("/api/storage/status", authMiddleware, (c) => {
  const hasAccessKey = Boolean(c.env.R2_ACCESS_KEY_ID)
  const hasSecretKey = Boolean(c.env.R2_SECRET_ACCESS_KEY)
  const endpointConfigured = Boolean(c.env.R2_ENDPOINT)
  const bucketConfigured = Boolean(c.env.R2_BUCKET_NAME)
  const presignedUrls = hasAccessKey && hasSecretKey && endpointConfigured && bucketConfigured

  return c.json({
    provider: presignedUrls ? "r2-s3" : "r2-binding",
    bucketName: c.env.R2_BUCKET_NAME ?? null,
    bucketBinding: Boolean(c.env.STORAGE),
    s3Credentials: hasAccessKey && hasSecretKey,
    bucketConfigured,
    presignedUrls,
    endpointConfigured,
    expectedCorsOrigin: c.env.APP_URL ?? "http://localhost:5173",
  })
})

app.route("/api/workspaces", workspacesHandler)
app.post(
  "/api/transfer-ownership",
  authMiddleware,
  requirePermission("users.update_roles"),
  transferOwnershipHandler,
)
app.route("/api/workspaces/:workspaceId/files", filesHandler)
app.route("/api/workspaces/:workspaceId/folders", foldersHandler)
app.route("/api/workspaces/:workspaceId/members", membersHandler)
app.route("/api/workspaces/:workspaceId/invitations", invitationsHandler)
app.route("/api/workspaces/:workspaceId/search", searchHandler)
app.route("/api/workspaces/:workspaceId/dashboard", dashboardHandler)
app.route("/api/workspaces/:workspaceId/shares", sharesHandler)
app.route("/api/workspaces/:workspaceId/tags", tagsHandler)
app.route("/api/workspaces/:workspaceId/trash", trashHandler)
app.route("/api/workspaces/:workspaceId/notifications", notificationsHandler)
app.route("/api/workspaces/:workspaceId/batch", batchHandler)

app.route("/api/files", filesHandler)
app.route("/api/folders", foldersHandler)
app.route("/api/members", membersHandler)
app.route("/api/invitations", publicInvitationsHandler)
app.route("/api/invitations", invitationsHandler)
app.route("/api/search", searchHandler)
app.route("/api/dashboard", dashboardHandler)
app.route("/api/shares", publicSharesHandler)
app.route("/api/shares", sharesHandler)
app.route("/api/tags", tagsHandler)
app.route("/api/trash", trashHandler)
app.route("/api/notifications", notificationsHandler)
app.route("/api/platform", platformHandler)
app.route("/api/batch", batchHandler)

app.notFound((c) => {
  const url = new URL(c.req.url)
  const isNavigationRequest =
    (c.req.method === "GET" || c.req.method === "HEAD") && !url.pathname.startsWith("/api")

  if (isNavigationRequest) {
    const appUrl = c.env.APP_URL ?? "http://localhost:5173"
    return c.redirect(`${appUrl.replace(/\/$/, "")}${url.pathname}${url.search}`, 302)
  }

  return c.json({ code: "NOT_FOUND", message: "Not found" }, 404)
})

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json(
      {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: {
          issues: err.issues,
        },
      },
      400,
    )
  }

  console.error("Unhandled error:", err)
  return c.json(
    {
      code: "INTERNAL_ERROR",
      message: err instanceof Error ? err.message : "An unexpected error occurred",
    },
    500,
  )
})

export default app
