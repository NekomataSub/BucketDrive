export interface ApiOriginEnv {
  API_WORKER_URL?: string
  API_URL?: string
}

export function getApiOrigin(env: ApiOriginEnv, requestUrl: URL): string | null {
  const explicitWorkerUrl = env.API_WORKER_URL?.trim()
  if (explicitWorkerUrl) return explicitWorkerUrl.replace(/\/+$/, "")

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

export function buildApiUrl(env: ApiOriginEnv, requestUrl: URL, pathname: string): URL | null {
  const origin = getApiOrigin(env, requestUrl)
  if (!origin) return null
  return new URL(pathname, `${origin}/`)
}
