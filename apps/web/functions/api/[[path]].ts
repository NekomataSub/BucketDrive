interface ApiServiceBinding {
  fetch(request: Request): Promise<Response>
}

interface PagesFunctionContext {
  request: Request
  env: {
    API_SERVICE: ApiServiceBinding
  }
}

type PagesFunctionHandler = (context: PagesFunctionContext) => Promise<Response>

export const onRequest: PagesFunctionHandler = async (context) => {
  const requestUrl = new URL(context.request.url)
  const workerUrl = new URL(
    requestUrl.pathname + requestUrl.search,
    "https://api.internal/",
  )

  const headers = new Headers(context.request.headers)
  headers.delete("host")
  const forwardsBody =
    context.request.method !== "GET" && context.request.method !== "HEAD"

  const request = new Request(workerUrl, {
    method: context.request.method,
    headers,
    body: forwardsBody ? context.request.body : undefined,
    redirect: "manual",
  })

  return context.env.API_SERVICE.fetch(request)
}
