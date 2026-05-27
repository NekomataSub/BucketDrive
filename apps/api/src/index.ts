import { Hono } from "hono"
import { cors } from "hono/cors"
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
import { workspacesHandler } from "./modules/workspaces/workspaces.handler"
import { platformHandler } from "./modules/platform/platform.handler"

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
}

const app = new Hono<{ Bindings: Env }>()

function getAllowedOrigins(env: Env): string[] {
  return [
    env.APP_URL,
    env.API_URL,
    env.BETTER_AUTH_URL,
    "http://localhost:5173",
    "http://localhost:8787",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8787",
  ].filter((origin): origin is string => Boolean(origin))
}

app.use("*", securityHeaders)
app.use("*", cors({
  origin: (origin, c) => {
    if (!origin) return null
    const env = c.env as Env
    return getAllowedOrigins(env).includes(origin) ? origin : null
  },
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400,
}))

app.use("*", async (c, next) => {
  createD1DB(c.env.DB)
  await next()
})

app.all("/api/auth/*", (c) => {
  const origin = c.req.header("origin") ?? undefined
  const auth = createAuth(c.env, origin)
  return auth.handler(c.req.raw)
})

app.get("/api/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }))

app.route("/api/workspaces/:workspaceId/files", filesHandler)
app.route("/api/workspaces/:workspaceId/folders", foldersHandler)
app.route("/api/workspaces/:workspaceId/members", membersHandler)
app.route("/api/workspaces/:workspaceId/invitations", invitationsHandler)
app.route("/api/invitations", publicInvitationsHandler)
app.route("/api/workspaces/:workspaceId/search", searchHandler)
app.route("/api/workspaces/:workspaceId/dashboard", dashboardHandler)
app.route("/api/workspaces/:workspaceId/shares", sharesHandler)
app.route("/api/workspaces/:workspaceId/tags", tagsHandler)
app.route("/api/workspaces/:workspaceId/trash", trashHandler)
app.route("/api/notifications", notificationsHandler)
app.route("/api/shares", publicSharesHandler)
app.route("/api/workspaces", workspacesHandler)
app.route("/api/platform", platformHandler)

app.notFound((c) => c.json({ code: "NOT_FOUND", message: "Not found" }, 404))

app.onError((err, c) => {
  console.error("Unhandled error:", err)
  return c.json({
    code: "INTERNAL_ERROR",
    message: err instanceof Error ? err.message : "An unexpected error occurred",
  }, 500)
})

export default app
