import { getApiOrigin, type ApiOriginEnv } from "../_lib/api-origin"

interface PagesFunctionContext {
  request: Request
  env: ApiOriginEnv
}

type PagesFunctionHandler = (context: PagesFunctionContext) => Promise<Response>

export const onRequest: PagesFunctionHandler = async (context) => {
  const requestUrl = new URL(context.request.url)
  const apiWorkerUrl = getApiOrigin(context.env, requestUrl)
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
