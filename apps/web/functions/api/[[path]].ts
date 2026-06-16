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

function logProxyEvent(level: "warn" | "error", event: Record<string, unknown>): void {
  const payload = {
    service: "bucketdrive-pages-proxy",
    timestamp: new Date().toISOString(),
    ...event,
  }

  if (level === "error") {
    console.error(payload)
    return
  }

  console.warn(payload)
}

export const onRequest: PagesFunctionHandler = async (context) => {
  const requestUrl = new URL(context.request.url)
  const workerUrl = new URL(requestUrl.pathname + requestUrl.search, "https://api.internal/")

  const headers = new Headers(context.request.headers)
  headers.delete("host")
  const forwardsBody = context.request.method !== "GET" && context.request.method !== "HEAD"

  const request = new Request(workerUrl, {
    method: context.request.method,
    headers,
    body: forwardsBody ? context.request.body : undefined,
    redirect: "manual",
  })

  try {
    const response = await context.env.API_SERVICE.fetch(request)
    if (response.status >= 400) {
      logProxyEvent(response.status >= 500 ? "error" : "warn", {
        event: "pages_proxy.request_failed",
        method: context.request.method,
        path: requestUrl.pathname,
        status: response.status,
        cfRay: context.request.headers.get("cf-ray"),
      })
    }

    return response
  } catch (err) {
    logProxyEvent("error", {
      event: "pages_proxy.service_binding_error",
      method: context.request.method,
      path: requestUrl.pathname,
      cfRay: context.request.headers.get("cf-ray"),
      errorName: err instanceof Error ? err.name : "UnknownError",
      errorMessage: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    throw err
  }
}
