/* eslint-disable no-console */
import { spawnSync } from "child_process"
import { existsSync, readFileSync, writeFileSync } from "fs"

type Environment = "staging" | "production"

function runWrangler(args: string[]): string {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args], {
    encoding: "utf8",
    shell: true,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  })

  if (result.status !== 0) {
    console.error(`wrangler ${args.join(" ")} failed:`)
    console.error(result.stderr || result.stdout)
    throw new Error(`wrangler ${args.join(" ")} failed`)
  }

  return result.stdout
}

function runWranglerIgnoreError(args: string[]): string {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args], {
    encoding: "utf8",
    shell: true,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  })
  return (result.stdout || "") + (result.stderr || "")
}

function getD1DatabaseIdFromOutput(output: string): string | null {
  const match = output.match(/UUID\s*:\s*([a-f0-9-]+)/i)
  return match ? match[1] : null
}

function getBucketNameFromWrangler(environment: string): string {
  const wranglerPath = existsSync("wrangler.toml") ? "wrangler.toml" : "../../wrangler.toml"
  const wrangler = readFileSync(wranglerPath, "utf8")
  const pattern = new RegExp(
    `\\[\\[env\\.${environment}\\.r2_buckets\\]\\][\\s\\S]*?bucket_name\\s*=\\s*"([^"]+)"`,
  )
  const match = wrangler.match(pattern)
  return match ? match[1] : ""
}

function main() {
  const environment = process.argv[2] as Environment
  if (!environment || !["staging", "production"].includes(environment)) {
    console.error("Usage: tsx scripts/setup-cloudflare-infra.ts <staging|production>")
    console.error("Example: tsx scripts/setup-cloudflare-infra.ts staging")
    process.exit(1)
  }

  const dbName = environment === "staging" ? "bucketdrive-db-staging" : "bucketdrive-db"
  const d1Key = environment === "staging" ? "STAGING_D1_DATABASE_ID" : "PRODUCTION_D1_DATABASE_ID"
  const bucketName = getBucketNameFromWrangler(environment)

  // --- D1 Database ---
  console.log(`\n🔍 Checking D1 database "${dbName}"...`)
  const d1Info = runWranglerIgnoreError(["d1", "info", dbName])

  let d1Id: string
  const existingId = getD1DatabaseIdFromOutput(d1Info)
  if (existingId) {
    d1Id = existingId
    console.log(`✅ D1 database "${dbName}" already exists (UUID: ${d1Id})`)
  } else {
    console.log(`🆕 Creating D1 database "${dbName}"...`)
    runWrangler(["d1", "create", dbName])

    const d1InfoAfter = runWranglerIgnoreError(["d1", "info", dbName])
    const newId = getD1DatabaseIdFromOutput(d1InfoAfter)
    if (!newId) {
      console.error("❌ Could not parse UUID after creation")
      process.exit(1)
    }
    d1Id = newId
    console.log(`✅ Created D1 database "${dbName}" (UUID: ${d1Id})`)
  }

  // --- R2 Bucket ---
  if (bucketName) {
    console.log(`\n🔍 Checking R2 bucket "${bucketName}"...`)
    const r2List = runWranglerIgnoreError(["r2", "bucket", "list"])

    if (r2List.includes(bucketName)) {
      console.log(`✅ R2 bucket "${bucketName}" already exists`)
    } else {
      console.log(`🆕 Creating R2 bucket "${bucketName}"...`)
      try {
        runWrangler(["r2", "bucket", "create", bucketName])
        console.log(`✅ Created R2 bucket "${bucketName}"`)
      } catch {
        console.log(`⚠️ R2 bucket creation failed (bucket may already exist or name is taken)`)
      }
    }
  }

  // --- Output ---
  const output = {
    d1_database_id: d1Id,
    d1_key: d1Key,
    environment,
    bucket_name: bucketName,
  }
  writeFileSync("setup-output.json", JSON.stringify(output, null, 2))

  console.log(`\n📋 Setup output written to setup-output.json`)
  console.log(`   ${d1Key} = ${d1Id}`)
  if (bucketName) console.log(`   R2 bucket = ${bucketName}`)

  console.log(`\n📌 Next steps (manual, one-time):`)
  console.log(`   1. Create R2 API tokens in Cloudflare Dashboard and save as GitHub Secrets`)
  console.log(`   2. Configure OAuth apps (GitHub / Google) for your environment URLs`)
  console.log(`   3. Generate BETTER_AUTH_SECRET and save as GitHub Secret`)
  console.log(`   4. Set remaining environment variables (APP_URL, API_URL, etc.)`)
  console.log(`   5. Configure R2 CORS rules in the Cloudflare Dashboard`)
}

main()
