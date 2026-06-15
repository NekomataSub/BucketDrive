import { betterAuth } from "better-auth"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { and, eq, gte } from "drizzle-orm"
import * as schema from "@bucketdrive/shared/db/schema"
import { createD1DB } from "./db"
import { getAllowedOrigins } from "./origins"

interface AuthEnv {
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  APP_URL?: string
  API_URL?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  PLATFORM_OWNER_EMAIL?: string
  DB: D1Database
}

function extractHost(url?: string): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function getAllowedHosts(env: AuthEnv): string[] {
  const hosts = new Set<string>()
  const appHost = extractHost(env.APP_URL)
  const apiHost = extractHost(env.API_URL)
  const authHost = extractHost(env.BETTER_AUTH_URL)

  if (appHost) hosts.add(appHost)
  if (apiHost) hosts.add(apiHost)
  if (authHost) hosts.add(authHost)

  // If API_URL points to a Cloudflare Workers domain, allow the Workers wildcard pattern
  const apiUrl = env.API_URL ?? env.BETTER_AUTH_URL
  if (apiUrl && apiUrl.includes(".workers.dev")) {
    const workerDomain = apiUrl.match(/https:\/\/([^/]+\.workers\.dev)/)?.[1]
    if (workerDomain) {
      // Extract the account-level wildcard pattern: *.account-id.workers.dev
      const parts = workerDomain.split(".")
      if (parts.length >= 3 && parts[parts.length - 1] === "dev" && parts[parts.length - 2] === "workers") {
        const accountId = parts[parts.length - 3] ?? ""
        if (accountId) {
          hosts.add(`*.${accountId}.workers.dev`)
        }
      }
    }
  }

  return Array.from(hosts)
}

export function createAuth(env: AuthEnv, requestOrigin?: string) {
  const baseURL = env.BETTER_AUTH_URL ?? env.API_URL
  const configuredOrigins = getAllowedOrigins({ ...env, BETTER_AUTH_URL: baseURL })
  const trustedRequestOrigin =
    requestOrigin && configuredOrigins.includes(requestOrigin) ? requestOrigin : undefined
  const callbackOrigin = trustedRequestOrigin ?? env.APP_URL ?? baseURL
  const allowedHosts = getAllowedHosts(env)
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: {
      allowedHosts,
      protocol: "https",
      fallback: callbackOrigin,
    },
    database: drizzleAdapter(createD1DB(env.DB), {
      provider: "sqlite",
      schema,
    }),
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    account: {
      storeStateStrategy: "database",
    },
    cookie: {
      name: "__bucketdrive_session",
      attributes: {
        httpOnly: true,
        secure: baseURL?.startsWith("https://") ?? true,
        sameSite: "lax",
        path: "/",
      },
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID ?? "",
        clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
        redirectURI: callbackOrigin ? `${callbackOrigin}/api/auth/callback/github` : undefined,
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
        redirectURI: callbackOrigin ? `${callbackOrigin}/api/auth/callback/google` : undefined,
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const db = createD1DB(env.DB)
            const settings = await db
              .select()
              .from(schema.platformSettings)
              .where(eq(schema.platformSettings.id, "default"))
              .get()

            if (settings?.enablePublicSignup) return { data: user }

            const ownerEmail = env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase()
            if (ownerEmail && user.email.toLowerCase() === ownerEmail) return { data: user }

            const now = new Date().toISOString()
            const invite = await db
              .select()
              .from(schema.bucketInvitation)
              .where(
                and(
                  eq(schema.bucketInvitation.email, user.email.toLowerCase()),
                  eq(schema.bucketInvitation.status, "pending"),
                  gte(schema.bucketInvitation.expiresAt, now),
                ),
              )
              .get()

            if (invite) return { data: user }

            return false
          },
        },
      },
    },
    onAPIError: {
      errorURL: env.APP_URL ? `${env.APP_URL.replace(/\/$/, "")}/signup-denied` : undefined,
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        secure: baseURL?.startsWith("https://") ?? true,
        sameSite: "lax",
        path: "/",
      },
    },
    trustedOrigins: [...configuredOrigins],
  })
}
