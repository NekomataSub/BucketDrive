/* eslint-disable no-console */
import { resolve } from "path"
import { createRequire } from "module"
import { loadEnvFiles } from "./env-utils"

const requireFromApi = createRequire(resolve(__dirname, "../apps/api/package.json"))
type AwsClientConstructor = new (options: {
  accessKeyId: string
  secretAccessKey: string
  service: string
  region: string
}) => {
  sign(input: string, init?: { method?: string; aws?: { signQuery?: boolean } }): Promise<Request>
}

function readXmlValue(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(xml)
  return match?.[1]
}

async function main() {
  const aws4fetch = await import(requireFromApi.resolve("aws4fetch")) as {
    AwsClient: AwsClientConstructor
  }
  const vars = loadEnvFiles()
  const required = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET_NAME"]
  const missing = required.filter((key) => !vars[key])

  if (missing.length > 0) {
    console.error(`Missing R2 env vars: ${missing.join(", ")}`)
    process.exit(1)
  }

  const endpoint = vars.R2_ENDPOINT?.replace(/\/$/, "")
  const bucketName = vars.R2_BUCKET_NAME
  const origin = vars.APP_URL ?? "http://localhost:5173"
  const accessKeyId = vars.R2_ACCESS_KEY_ID
  const secretAccessKey = vars.R2_SECRET_ACCESS_KEY

  if (!endpoint || !bucketName || !accessKeyId || !secretAccessKey) {
    console.error("Missing required R2 env vars after validation.")
    process.exit(1)
  }

  const listUrl = new URL(`${endpoint}/${bucketName}`)
  listUrl.searchParams.set("list-type", "2")
  listUrl.searchParams.set("max-keys", "1")
  const uploadUrl = new URL(`${endpoint}/${bucketName}/bucketdrive-r2-verify.txt`)
  uploadUrl.searchParams.set("X-Amz-Expires", "60")

  const s3 = new aws4fetch.AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  })

  const signedList = await s3.sign(listUrl.toString(), { method: "GET" })
  const listResponse = await fetch(signedList)
  const text = await listResponse.text()

  const code = readXmlValue(text, "Code")
  const message = readXmlValue(text, "Message")

  console.log(`R2 bucket: ${bucketName}`)
  console.log(`R2 endpoint: ${endpoint}`)
  console.log(`ListObjectsV2 status: ${String(listResponse.status)} ${listResponse.statusText}`)

  if (!listResponse.ok) {
    console.log(`R2 error code: ${code ?? "UNKNOWN"}`)
    console.log(`R2 error message: ${message ?? text.slice(0, 200)}`)
    process.exit(1)
  }

  console.log("R2 credentials can list the configured bucket.")

  const signedUpload = await s3.sign(uploadUrl.toString(), {
    method: "PUT",
    aws: { signQuery: true },
  })
  const corsResponse = await fetch(signedUpload.url, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  })
  const allowOrigin = corsResponse.headers.get("Access-Control-Allow-Origin")
  const allowMethods = corsResponse.headers.get("Access-Control-Allow-Methods")

  console.log(`Presigned PUT CORS status: ${String(corsResponse.status)} ${corsResponse.statusText}`)
  console.log(`CORS allow-origin: ${allowOrigin ?? "missing"}`)
  console.log(`CORS allow-methods: ${allowMethods ?? "missing"}`)

  if (!corsResponse.ok || allowOrigin !== origin) {
    console.log(`Run pnpm r2:cors:dev to apply local browser upload CORS for ${origin}.`)
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "R2 verification failed")
  process.exit(1)
})
