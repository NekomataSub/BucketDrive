/* eslint-disable no-console */
import { existsSync, lstatSync, mkdirSync, readlinkSync, renameSync, symlinkSync } from "fs"
import { resolve, relative, dirname } from "path"
import { spawnSync } from "child_process"
import { loadEnvFiles, parseEnvFile } from "./env-utils"

const ROOT_ENV = resolve(__dirname, "../.dev.vars")
const API_ENV_LINKS = [
  resolve(__dirname, "../apps/api/.dev.vars"),
  resolve(__dirname, "../apps/api/.env"),
]

const REQUIRED_LOCAL_KEYS = [
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

const DEPLOY_RUNTIME_KEYS = [
  "APP_URL",
  "API_URL",
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

function usage() {
  console.log([
    "Usage:",
    "  pnpm env:check",
    "  pnpm env:link",
    "  pnpm env:push:staging",
    "  pnpm env:push:prod",
    "  pnpm env:push -- <staging|production> [path/to/env-file]",
  ].join("\n"))
}

function ensureCanonicalEnv() {
  if (existsSync(ROOT_ENV)) return
  throw new Error("Missing .dev.vars. Create it from .env.example first.")
}

function linkLocalEnv() {
  ensureCanonicalEnv()

  for (const target of API_ENV_LINKS) {
    mkdirSync(dirname(target), { recursive: true })
    const linkTarget = relative(dirname(target), ROOT_ENV)

    if (existsSync(target)) {
      const stat = lstatSync(target)
      if (stat.isSymbolicLink() && readlinkSync(target) === linkTarget) {
        console.log(`${relative(process.cwd(), target)} -> ${linkTarget}`)
        continue
      }

      const backup = `${target}.bak.${String(Date.now())}`
      renameSync(target, backup)
      console.log(`Backed up ${relative(process.cwd(), target)} to ${relative(process.cwd(), backup)}`)
    }

    symlinkSync(linkTarget, target)
    console.log(`Linked ${relative(process.cwd(), target)} -> ${linkTarget}`)
  }
}

function checkEnv() {
  const vars = loadEnvFiles([ROOT_ENV])
  const missing = REQUIRED_LOCAL_KEYS.filter((key) => !vars[key]?.trim())

  if (missing.length > 0) {
    console.error(`Missing required local env keys in .dev.vars: ${missing.join(", ")}`)
    process.exit(1)
  }

  const oauthConfigured = Boolean(vars.GITHUB_CLIENT_ID && vars.GITHUB_CLIENT_SECRET) ||
    Boolean(vars.GOOGLE_CLIENT_ID && vars.GOOGLE_CLIENT_SECRET)

  if (!oauthConfigured) {
    console.error("Missing OAuth credentials. Configure GitHub or Google client id/secret in .dev.vars.")
    process.exit(1)
  }

  console.log(".dev.vars has the required local runtime keys.")
}

function getDeployEnvFile(environment: string, explicitFile?: string) {
  if (explicitFile) return resolve(process.cwd(), explicitFile)

  const preferred = resolve(process.cwd(), `.env.${environment}`)
  if (existsSync(preferred)) return preferred

  return ROOT_ENV
}

function pushDeployEnv(environment: string, explicitFile?: string) {
  if (environment !== "staging" && environment !== "production") {
    throw new Error("Environment must be staging or production.")
  }

  const envFile = getDeployEnvFile(environment, explicitFile)
  if (!existsSync(envFile)) {
    throw new Error(`Missing env file: ${relative(process.cwd(), envFile)}`)
  }

  const vars = parseEnvFile(envFile)
  const keys = DEPLOY_RUNTIME_KEYS.filter((key) => vars[key]?.trim())

  if (keys.length === 0) {
    throw new Error(`No deploy runtime keys found in ${relative(process.cwd(), envFile)}`)
  }

  console.log(`Pushing ${String(keys.length)} runtime vars from ${relative(process.cwd(), envFile)} to ${environment}.`)

  for (const key of keys) {
    const result = spawnSync(
      "pnpm",
      ["--filter", "@bucketdrive/api", "exec", "wrangler", "secret", "put", key, "--env", environment],
      {
        cwd: resolve(__dirname, ".."),
        input: vars[key],
        stdio: ["pipe", "inherit", "inherit"],
        shell: process.platform === "win32",
      },
    )

    if (result.status !== 0) {
      throw new Error(`Failed to push ${key} to ${environment}.`)
    }
  }
}

function main() {
  const [command, environment, file] = process.argv.slice(2)

  switch (command) {
    case "check":
      checkEnv()
      return
    case "link":
      linkLocalEnv()
      return
    case "push":
      if (!environment) {
        usage()
        process.exit(1)
      }
      pushDeployEnv(environment, file)
      return
    default:
      usage()
      process.exit(1)
  }
}

try {
  main()
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : "Environment command failed")
  process.exit(1)
}
