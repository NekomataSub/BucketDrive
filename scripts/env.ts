/* eslint-disable no-console */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "fs"
import { dirname, relative, resolve } from "path"
import { spawnSync } from "child_process"
import {
  API_RUNTIME_KEYS,
  API_SECRET_KEYS,
  LOCAL_ENV_LINKS,
  LOCAL_RUNTIME_KEYS,
  OAUTH_KEY_PAIRS,
  ROOT_ENV_FILE,
  WORKERS_RUNTIME_KEYS,
  WORKERS_SECRET_KEYS,
  getDeployEnvFile,
  loadEnvFiles,
  loadEnvWithProcess,
  parseEnvFile,
} from "./env-utils"

type DeployEnvironment = "staging" | "production"

type WranglerTarget = {
  configPath: string
  packageName: string
  runtimeKeys: string[]
  secretKeys: string[]
}

const ROOT_DIR = resolve(__dirname, "..")
const API_WRANGLER = resolve(ROOT_DIR, "wrangler.toml")
const WORKERS_WRANGLER = resolve(ROOT_DIR, "apps/workers/wrangler.toml")

const WRANGLER_TARGETS: WranglerTarget[] = [
  {
    configPath: API_WRANGLER,
    packageName: "@bucketdrive/api",
    runtimeKeys: API_RUNTIME_KEYS,
    secretKeys: API_SECRET_KEYS,
  },
  {
    configPath: WORKERS_WRANGLER,
    packageName: "@bucketdrive/workers",
    runtimeKeys: WORKERS_RUNTIME_KEYS,
    secretKeys: WORKERS_SECRET_KEYS,
  },
]

const DEPLOY_REQUIRED_KEYS = [
  "APP_URL",
  "API_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "PLATFORM_OWNER_EMAIL",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
]

function usage() {
  console.log(
    [
      "Usage:",
      "  pnpm env:check",
      "  pnpm env:check:staging",
      "  pnpm env:check:production",
      "  pnpm env:link",
      "  pnpm env:prepare:staging",
      "  pnpm env:prepare:production",
      "  pnpm env:push:staging",
      "  pnpm env:push:production",
      "  pnpm env:check -- <local|staging|production> [path/to/env-file]",
      "  pnpm env:prepare -- <staging|production> [path/to/env-file]",
      "  pnpm env:push -- <staging|production> [path/to/env-file]",
    ].join("\n"),
  )
}

function normalizeEnvironment(environment?: string): DeployEnvironment {
  if (environment === "prod") return "production"
  if (environment === "staging" || environment === "production") return environment
  throw new Error("Environment must be staging or production.")
}

function ensureCanonicalEnv() {
  if (existsSync(ROOT_ENV_FILE)) return
  throw new Error("Missing .dev.vars. Create it from .env.example first.")
}

function linkLocalEnv() {
  ensureCanonicalEnv()

  for (const target of LOCAL_ENV_LINKS) {
    mkdirSync(dirname(target), { recursive: true })
    const linkTarget = relative(dirname(target), ROOT_ENV_FILE)

    if (existsSync(target)) {
      const stat = lstatSync(target)
      if (stat.isSymbolicLink() && readlinkSync(target) === linkTarget) {
        console.log(`${relative(process.cwd(), target)} -> ${linkTarget}`)
        continue
      }

      const backup = `${target}.bak.${String(Date.now())}`
      renameSync(target, backup)
      console.log(
        `Backed up ${relative(process.cwd(), target)} to ${relative(process.cwd(), backup)}`,
      )
    }

    symlinkSync(linkTarget, target)
    console.log(`Linked ${relative(process.cwd(), target)} -> ${linkTarget}`)
  }
}

function checkLocalEnv() {
  const vars = loadEnvFiles([ROOT_ENV_FILE])
  const missing = LOCAL_RUNTIME_KEYS.filter((key) => !vars[key]?.trim())

  if (missing.length > 0) {
    console.error(`Missing required local env keys in .dev.vars: ${missing.join(", ")}`)
    process.exit(1)
  }

  assertOauthConfigured(vars, ".dev.vars")
  console.log(".dev.vars has the required local runtime keys.")
}

function checkDeployEnv(environment: DeployEnvironment, explicitFile?: string) {
  const vars = loadDeployVars(environment, explicitFile)
  const d1Key = getD1Key(environment)
  const missing = [...DEPLOY_REQUIRED_KEYS, d1Key].filter((key) => !vars[key]?.trim())

  if (missing.length > 0) {
    console.error(`Missing required ${environment} env keys: ${missing.join(", ")}`)
    process.exit(1)
  }

  assertOauthConfigured(vars, `${environment} env`)
  console.log(`${environment} env has the required deploy and runtime keys.`)
}

function assertOauthConfigured(vars: Record<string, string>, source: string) {
  const oauthConfigured = OAUTH_KEY_PAIRS.some(([clientId, clientSecret]) =>
    Boolean(vars[clientId]?.trim() && vars[clientSecret]?.trim()),
  )

  if (!oauthConfigured) {
    console.error(
      `Missing OAuth credentials. Configure GitHub or Google client id/secret in ${source}.`,
    )
    process.exit(1)
  }
}

function parseUrl(value: string | undefined): URL | null {
  if (!value?.trim()) return null

  try {
    return new URL(value)
  } catch {
    return null
  }
}

function loadDeployVars(environment: DeployEnvironment, explicitFile?: string) {
  const envFile = getDeployEnvFile(environment, explicitFile)
  const files = existsSync(envFile) ? [envFile] : []
  return loadEnvWithProcess(files)
}

function prepareDeployEnv(environment: DeployEnvironment, explicitFile?: string) {
  const vars = loadDeployVars(environment, explicitFile)
  const d1Id = vars[getD1Key(environment)]?.trim() || vars.D1_DATABASE_ID?.trim()
  const d1Name = getD1Name(vars, environment)
  const appUrl = vars.APP_URL?.trim()
  const apiUrl = vars.API_URL?.trim()
  const r2BucketName = vars.R2_BUCKET_NAME?.trim()

  patchWranglerConfig(API_WRANGLER, environment, {
    d1Id,
    d1Name,
    appUrl,
    apiUrl,
    r2BucketName,
  })
  patchWranglerConfig(WORKERS_WRANGLER, environment, {
    d1Id,
    d1Name,
    appUrl,
    apiUrl,
    r2BucketName,
  })
  console.log(`Prepared Wrangler configs for ${environment} from environment values.`)
}

function patchWranglerConfig(
  configPath: string,
  environment: DeployEnvironment,
  options: {
    d1Id?: string
    d1Name?: string
    appUrl?: string
    apiUrl?: string
    r2BucketName?: string
  },
) {
  if (!existsSync(configPath)) {
    throw new Error(`Missing Wrangler config: ${relative(process.cwd(), configPath)}`)
  }

  const current = readFileSync(configPath, "utf8")
  let next = current

  if (options.d1Id) {
    next = replaceWranglerBinding(next, environment, "d1_databases", "database_id", options.d1Id)
  }

  if (options.d1Name) {
    next = replaceWranglerBinding(
      next,
      environment,
      "d1_databases",
      "database_name",
      options.d1Name,
    )
  }

  if (options.appUrl) next = replaceWranglerVar(next, environment, "APP_URL", options.appUrl)
  if (options.apiUrl) next = replaceWranglerVar(next, environment, "API_URL", options.apiUrl)
  if (options.r2BucketName) {
    next = replaceWranglerBinding(
      next,
      environment,
      "r2_buckets",
      "bucket_name",
      options.r2BucketName,
    )
  }

  writeFileSync(configPath, next)
}

function replaceWranglerBinding(
  wrangler: string,
  environment: DeployEnvironment,
  binding: "d1_databases" | "r2_buckets",
  key: "database_id" | "database_name" | "bucket_name",
  value: string,
) {
  const pattern = new RegExp(
    `(\\[\\[env\\.${environment}\\.${binding}\\]\\][\\s\\S]*?${key}\\s*=\\s*")([^"]*)(")`,
  )
  if (!pattern.test(wrangler)) {
    throw new Error(`Could not locate env.${environment}.${binding}.${key} in Wrangler config.`)
  }

  const next = wrangler.replace(
    pattern,
    (_match: string, prefix: string, _current: string, suffix: string) =>
      `${prefix}${value}${suffix}`,
  )

  return next
}

function replaceWranglerVar(
  wrangler: string,
  environment: DeployEnvironment,
  key: "APP_URL" | "API_URL",
  value: string,
) {
  const section = `[env.${environment}.vars]`
  const lines = wrangler.split(/\r?\n/)
  const sectionIndex = lines.findIndex((line) => line.trim() === section)

  if (sectionIndex === -1) {
    throw new Error(`Could not locate ${section} in Wrangler config.`)
  }

  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) continue
    if (line.trim().startsWith("[")) break

    if (line.trim().startsWith(`${key} =`)) {
      lines[index] = `${key} = "${value}"`
      return lines.join("\n")
    }
  }

  throw new Error(`Could not locate env.${environment}.vars.${key} in Wrangler config.`)
}

function pushDeployEnv(environment: DeployEnvironment, explicitFile?: string) {
  const envFile = getDeployEnvFile(environment, explicitFile)
  if (!existsSync(envFile)) {
    throw new Error(`Missing env file: ${relative(process.cwd(), envFile)}`)
  }

  const vars = parseEnvFile(envFile)

  for (const target of WRANGLER_TARGETS) {
    const keys = target.secretKeys.filter((key) => vars[key]?.trim())

    if (keys.length === 0) {
      console.log(`No secrets to push for ${target.packageName}; skipping ${environment}.`)
      continue
    }

    console.log(
      `Pushing ${String(keys.length)} secrets from ${relative(
        process.cwd(),
        envFile,
      )} to ${target.packageName} ${environment}.`,
    )

    for (const key of keys) {
      const result = spawnSync(
        "pnpm",
        [
          "--filter",
          target.packageName,
          "exec",
          "wrangler",
          "secret",
          "put",
          key,
          "--env",
          environment,
        ],
        {
          cwd: ROOT_DIR,
          input: vars[key],
          stdio: ["pipe", "inherit", "inherit"],
          shell: process.platform === "win32",
        },
      )

      if (result.status !== 0) {
        throw new Error(`Failed to push ${key} to ${target.packageName} ${environment}.`)
      }
    }
  }
}

function getD1Key(environment: DeployEnvironment) {
  return environment === "staging" ? "STAGING_D1_DATABASE_ID" : "PRODUCTION_D1_DATABASE_ID"
}

function getD1Name(vars: Record<string, string>, environment: DeployEnvironment) {
  const environmentKey =
    environment === "staging" ? "STAGING_D1_DATABASE_NAME" : "PRODUCTION_D1_DATABASE_NAME"
  return vars[environmentKey]?.trim() || vars.D1_DATABASE_NAME?.trim()
}

function main() {
  const [command, environmentArg, file] = process.argv.slice(2)

  switch (command) {
    case "check":
      if (!environmentArg || environmentArg === "local") {
        checkLocalEnv()
        return
      }
      checkDeployEnv(normalizeEnvironment(environmentArg), file)
      return
    case "link":
      linkLocalEnv()
      return
    case "prepare":
      prepareDeployEnv(normalizeEnvironment(environmentArg), file)
      return
    case "push":
      pushDeployEnv(normalizeEnvironment(environmentArg), file)
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
