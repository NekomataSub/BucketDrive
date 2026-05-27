import { createMiddleware } from "hono/factory"
import { eq } from "drizzle-orm"
import { user as userSchema } from "@bucketdrive/shared/db/schema"
import { createAuth } from "../lib/auth"
import { getDB } from "../lib/db"

interface AuthVariables {
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean; canCreateWorkspaces: boolean }
  session: { id: string; userId: string; expiresAt: Date }
}

export const authMiddleware = createMiddleware<{
  Bindings: { BETTER_AUTH_SECRET?: string; DB: D1Database; GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }
  Variables: AuthVariables
}>(async (c, next) => {
  const origin = c.req.header("origin") ?? undefined
  const auth = createAuth(c.env, origin)
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (!session) {
    return c.json({ code: "UNAUTHORIZED", message: "Authentication required" }, 401)
  }

  const dbUser = await getDB()
    .select({
      isPlatformAdmin: userSchema.isPlatformAdmin,
      canCreateWorkspaces: userSchema.canCreateWorkspaces,
    })
    .from(userSchema)
    .where(eq(userSchema.id, session.user.id))
    .get()

  c.set("user", {
    ...session.user,
    isPlatformAdmin: dbUser?.isPlatformAdmin ?? false,
    canCreateWorkspaces: dbUser?.canCreateWorkspaces ?? false,
  })
  c.set("session", session.session)

  await next()
})
