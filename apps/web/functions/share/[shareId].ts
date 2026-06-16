import { buildApiUrl, type ApiOriginEnv } from "../_lib/api-origin"
import {
  buildShareHeadTags,
  buildShareMetadata,
  injectShareHead,
  type ShareInfo,
} from "../_lib/share-metadata"

interface PagesFunctionContext {
  request: Request
  env: ApiOriginEnv & {
    ASSETS: {
      fetch: typeof fetch
    }
  }
  params: {
    shareId?: string | string[]
  }
}

type PagesFunctionHandler = (context: PagesFunctionContext) => Promise<Response>

export const onRequest: PagesFunctionHandler = async (context) => {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    })
  }

  const requestUrl = new URL(context.request.url)
  const shareId = getParam(context.params.shareId)
  const info = shareId ? await fetchShareInfo(context.env, requestUrl, shareId) : null
  const metadata = buildShareMetadata(info)
  const pageUrl = requestUrl.origin + requestUrl.pathname
  const imageUrl = `${requestUrl.origin}/og/share/${encodeURIComponent(shareId ?? "unknown")}.png`
  const headTags = buildShareHeadTags({ metadata, pageUrl, imageUrl })
  const indexResponse = await context.env.ASSETS.fetch(new Request(new URL("/", requestUrl), {
    method: "GET",
  }))

  if (!indexResponse.ok) return indexResponse

  const html = injectShareHead(await indexResponse.text(), metadata.title, headTags)
  const headers = new Headers(indexResponse.headers)
  headers.set("Content-Type", "text/html; charset=utf-8")
  headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300")

  return new Response(context.request.method === "HEAD" ? null : html, {
    status: 200,
    headers,
  })
}

async function fetchShareInfo(
  env: ApiOriginEnv,
  requestUrl: URL,
  shareId: string,
): Promise<ShareInfo | null> {
  const apiUrl = buildApiUrl(env, requestUrl, `/api/shares/${encodeURIComponent(shareId)}`)
  if (!apiUrl) return null

  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
    })
    if (!response.ok) return null
    return (await response.json()) as ShareInfo
  } catch {
    return null
  }
}

function getParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
