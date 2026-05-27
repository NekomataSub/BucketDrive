import { betterAuth } from "better-auth"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { organization } from "better-auth/plugins"
import { adminAc, memberAc, ownerAc } from "better-auth/plugins/organization/access"
import * as schema from "@bucketdrive/shared/db/schema"
import { createD1DB } from "./db"

interface AuthEnv {
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  APP_URL?: string
  API_URL?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  DB: D1Database
}

export function createAuth(env: AuthEnv, requestOrigin?: string) {
  const baseURL = env.BETTER_AUTH_URL ?? env.API_URL
  const configuredOrigins = [
    env.APP_URL,
    baseURL,
    "http://localhost:5173",
    "http://localhost:8787",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8787",
  ].filter((origin): origin is string => Boolean(origin))
  const trustedRequestOrigin =
    requestOrigin && configuredOrigins.includes(requestOrigin) ? requestOrigin : undefined
  const callbackOrigin = trustedRequestOrigin ?? env.APP_URL ?? baseURL
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
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
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        secure: baseURL?.startsWith("https://") ?? true,
        sameSite: "lax",
        path: "/",
      },
    },
    trustedOrigins: [
      ...configuredOrigins,
    ],
    plugins: [
      organization({
        creatorRole: "owner",
        roles: {
          owner: ownerAc,
          admin: adminAc,
          editor: memberAc,
          viewer: memberAc,
        },
      }),
    ],
  })
}
