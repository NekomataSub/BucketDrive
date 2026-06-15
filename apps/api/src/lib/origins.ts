export interface OriginEnv {
  APP_URL?: string
  API_URL?: string
  BETTER_AUTH_URL?: string
}

const LOCAL_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8787",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8787",
] as const

export function getAllowedOrigins(env: OriginEnv): string[] {
  return [
    ...new Set([env.APP_URL, env.API_URL, env.BETTER_AUTH_URL, ...LOCAL_ORIGINS].filter(isString)),
  ]
}

function isString(value: string | undefined): value is string {
  return Boolean(value)
}
