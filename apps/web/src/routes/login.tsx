import { Link, useSearch } from "@tanstack/react-router"
import { FolderOpen } from "lucide-react"

const GitHubIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
)

async function signIn(provider: string, redirectPath: string) {
  const res = await fetch("/api/auth/sign-in/social", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, callbackURL: `${window.location.origin}${redirectPath}` }),
  })
  if (res.redirected) {
    window.location.href = res.url
  } else if (res.ok) {
    const data = (await res.json()) as { url?: string }
    if (data.url) window.location.href = data.url
  }
}

export function LoginPage() {
  const search: { redirect?: string } = useSearch({ strict: false })
  const redirectPath = search.redirect?.startsWith("/") ? search.redirect : "/dashboard"

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-primary">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-hover">
        <FolderOpen className="h-8 w-8 text-accent" />
      </div>
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-text-primary">BucketDrive</h1>
        <p className="mt-2 text-text-secondary">Sign in to access your files</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void signIn("github", redirectPath)
        }}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:opacity-90"
      >
        <GitHubIcon />
        Sign in with GitHub
      </button>
      <button
        type="button"
        onClick={() => {
          void signIn("google", redirectPath)
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-border-default bg-surface-default px-6 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Sign in with Google
      </button>
      <p className="text-xs text-text-tertiary">
        <Link to="/" className="text-text-link hover:underline">
          &larr; Back to home
        </Link>
      </p>
    </div>
  )
}
