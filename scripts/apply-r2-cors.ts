/* eslint-disable no-console */
import { resolve } from "path"
import { spawn } from "child_process"
import { loadEnvFiles } from "./env-utils"

function run(command: string, args: string[]) {
  return new Promise<number>((resolveCode) => {
    const child = spawn(command, args, {
      cwd: resolve(__dirname, ".."),
      stdio: "inherit",
      shell: process.platform === "win32",
    })

    child.on("close", (code) => {
      resolveCode(code ?? 1)
    })
  })
}

async function main() {
  const vars = loadEnvFiles()
  const bucketName = vars.R2_BUCKET_NAME?.trim()

  if (!bucketName) {
    console.error("Missing R2_BUCKET_NAME in .dev.vars, apps/api/.dev.vars, or apps/api/.env")
    process.exit(1)
  }

  console.log(`Applying local R2 CORS rules to bucket: ${bucketName}`)

  const exitCode = await run("pnpm", [
    "--filter",
    "@bucketdrive/api",
    "exec",
    "wrangler",
    "r2",
    "bucket",
    "cors",
    "set",
    bucketName,
    "--file",
    "../../docs/storage/r2-cors.dev.json",
    "--force",
  ])

  process.exit(exitCode)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "Failed to apply R2 CORS rules")
  process.exit(1)
})
