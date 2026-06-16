interface PagesFunctionContext {
  request: Request
  env: {
    API_WORKER_URL?: string
    API_URL?: string
  }
}

type PagesFunctionHandler = (context: PagesFunctionContext) => Promise<Response>

export const onRequest: PagesFunctionHandler = async (context) => {
  const requestUrl = new URL(context.request.url)
  const apiWorkerUrl = getProxyOrigin(context.env, requestUrl)
  if (!apiWorkerUrl) {
    return new Response(
      "Missing API_WORKER_URL Pages environment variable. API_URL can only be used when it points to a different origin than the Pages app.",
      { status: 500 },
    )
  }

  const workerUrl = new URL(
    requestUrl.pathname + requestUrl.search,
    apiWorkerUrl.replace(/\/+$/, "") + "/",
  )
  const headers = new Headers(context.request.headers)
  headers.delete("host")
  const forwardsBody = context.request.method !== "GET" && context.request.method !== "HEAD"

  const request = new Request(workerUrl, {
    method: context.request.method,
    headers,
    body: forwardsBody ? context.request.body : undefined,
    redirect: "manual",
  })

  return fetch(request)
}

function getProxyOrigin(env: PagesFunctionContext["env"], requestUrl: URL): string | null {
  const explicitWorkerUrl = env.API_WORKER_URL?.trim()
  if (explicitWorkerUrl) return explicitWorkerUrl

  const apiUrl = env.API_URL?.trim()
  if (!apiUrl) return null

  let parsedApiUrl: URL
  try {
    parsedApiUrl = new URL(apiUrl)
  } catch {
    return null
  }

  if (parsedApiUrl.origin === requestUrl.origin) return null
  return parsedApiUrl.origin
}
