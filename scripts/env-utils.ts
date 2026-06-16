import { existsSync, readFileSync } from "fs"
import { resolve } from "path"

export const ROOT_ENV_FILE = resolve(__dirname, "../.dev.vars")
export const LOCAL_ENV_LINKS = [
  resolve(__dirname, "../apps/api/.dev.vars"),
  resolve(__dirname, "../apps/api/.env"),
  resolve(__dirname, "../apps/workers/.dev.vars"),
  resolve(__dirname, "../apps/workers/.env"),
]

export const DEFAULT_ENV_FILES = [ROOT_ENV_FILE, ...LOCAL_ENV_LINKS]

export const LOCAL_RUNTIME_KEYS = [
  "APP_URL",
  "API_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "PLATFORM_OWNER_EMAIL",
]

export const OAUTH_KEY_PAIRS = [
  ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
] as const

// ── Vars (declared in wrangler.toml [env.*.vars], managed by env:prepare) ──
export const API_VAR_KEYS = ["APP_URL", "API_URL"] as const
export const WORKERS_VAR_KEYS = ["APP_URL", "API_URL"] as const

// ── Secrets (managed by wrangler secret put, via env:push) ──
export const API_SECRET_KEYS = [
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "PLATFORM_OWNER_EMAIL",
]

export const WORKERS_SECRET_KEYS = [
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "PLATFORM_OWNER_EMAIL",
]

// ── Combined (used for validation) ──
export const API_RUNTIME_KEYS = [...API_VAR_KEYS, ...API_SECRET_KEYS]
export const WORKERS_RUNTIME_KEYS = [...WORKERS_VAR_KEYS, ...WORKERS_SECRET_KEYS]

export const DEPLOY_ONLY_KEYS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "D1_DATABASE_NAME",
  "STAGING_D1_DATABASE_NAME",
  "PRODUCTION_D1_DATABASE_NAME",
  "STAGING_D1_DATABASE_ID",
  "PRODUCTION_D1_DATABASE_ID",
  "D1_DATABASE_ID",
  "PLAYWRIGHT_BASE_URL",
  "PAGES_PROJECT_NAME",
  "PAGES_BRANCH",
]

export function parseEnvFile(file: string): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const index = trimmed.indexOf("=")
    vars[trimmed.slice(0, index)] = stripQuotes(trimmed.slice(index + 1))
  }

  return vars
}

export function loadEnvFiles(files = DEFAULT_ENV_FILES): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const file of files) {
    if (!existsSync(file)) continue
    Object.assign(vars, parseEnvFile(file))
  }

  return vars
}

export function loadEnvWithProcess(files = DEFAULT_ENV_FILES): Record<string, string> {
  const vars = loadEnvFiles(files)

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") vars[key] = value
  }

  return vars
}

export function getDeployEnvFile(environment: string, explicitFile?: string) {
  if (explicitFile) return resolve(process.cwd(), explicitFile)

  const preferred = resolve(process.cwd(), `.env.${environment}`)
  if (existsSync(preferred)) return preferred

  return ROOT_ENV_FILE
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}
