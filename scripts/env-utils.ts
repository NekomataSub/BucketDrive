import { existsSync, readFileSync } from "fs"
import { resolve } from "path"

export const DEFAULT_ENV_FILES = [
  resolve(__dirname, "../.dev.vars"),
  resolve(__dirname, "../apps/api/.dev.vars"),
  resolve(__dirname, "../apps/api/.env"),
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

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}
