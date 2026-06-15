/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { useState, useEffect } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useAcceptInvitation, useInvitationByToken } from "@/lib/api"
import { useBranding } from "@/lib/branding"

export function JoinPage() {
  const search = useSearch({ strict: false })
  const token = (search as { token?: string }).token ?? null
  const navigate = useNavigate()

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  const invitationQuery = useInvitationByToken(token)
  const acceptInvitation = useAcceptInvitation()
  const branding = useBranding()

  const signOutAndSwitchAccount = async () => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
    }).catch(() => null)
    window.location.href = `/login?redirect=/join?token=${encodeURIComponent(token ?? "")}`
  }

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/get-session", { credentials: "include" })
        if (res.ok) {
          const data = (await res.json()) as { user?: { email?: string } } | null
          setIsAuthenticated(true)
          setUserEmail(data?.user?.email ?? null)
        } else {
          setIsAuthenticated(false)
        }
      } catch {
        setIsAuthenticated(false)
      }
    }
    void checkAuth()
  }, [])

  if (!token) {
    return (
      <div className="bg-bg-primary flex min-h-screen items-center justify-center p-6">
        <div className="border-border-default bg-surface-default w-full max-w-sm rounded-2xl border p-8 text-center shadow-sm">
          <h1 className="text-text-primary text-xl font-semibold">Invalid Invitation</h1>
          <p className="text-text-secondary mt-2 text-sm">No invitation token was provided.</p>
        </div>
      </div>
    )
  }

  if (invitationQuery.isLoading || isAuthenticated === null) {
    return (
      <div className="bg-bg-primary flex min-h-screen items-center justify-center">
        <div className="border-accent h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  if (invitationQuery.isError) {
    return (
      <div className="bg-bg-primary flex min-h-screen items-center justify-center p-6">
        <div className="border-border-default bg-surface-default w-full max-w-sm rounded-2xl border p-8 text-center shadow-sm">
          <h1 className="text-text-primary text-xl font-semibold">Invitation Unavailable</h1>
          <p className="text-text-secondary mt-2 text-sm">
            {invitationQuery.error?.message ?? "This invitation is no longer valid."}
          </p>
        </div>
      </div>
    )
  }

  const invite = invitationQuery.data
  if (!invite) {
    return (
      <div className="bg-bg-primary flex min-h-screen items-center justify-center p-6">
        <div className="border-border-default bg-surface-default w-full max-w-sm rounded-2xl border p-8 text-center shadow-sm">
          <h1 className="text-text-primary text-xl font-semibold">Invitation Unavailable</h1>
          <p className="text-text-secondary mt-2 text-sm">Unable to load invitation details.</p>
        </div>
      </div>
    )
  }

  const emailMatches = userEmail?.toLowerCase() === invite.email.toLowerCase()

  return (
    <div className="bg-bg-primary flex min-h-screen items-center justify-center p-6">
      <div className="border-border-default bg-surface-default w-full max-w-sm rounded-2xl border p-8 shadow-sm">
        <div className="bg-accent/10 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
          <svg
            className="text-accent h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        <h1 className="text-text-primary mt-4 text-center text-xl font-semibold">
          Bucket Invitation
        </h1>

        <p className="text-text-secondary mt-2 text-center text-sm">
          You have been invited to join{" "}
          <span className="text-text-primary font-medium">{branding.name}</span> as a{" "}
          <span className="text-text-primary font-medium capitalize">{invite.role}</span>.
        </p>

        <div className="border-border-default bg-bg-tertiary mt-6 rounded-xl border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Invited by</span>
            <span className="text-text-primary font-medium">{invite.invitedByName}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Email</span>
            <span className="text-text-primary font-medium">{invite.email}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Expires</span>
            <span className="text-text-primary font-medium">
              {new Date(invite.expiresAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {!isAuthenticated && (
          <div className="mt-6">
            <a
              href={`/login?redirect=/join?token=${token}`}
              className="bg-accent block w-full rounded-xl px-4 py-2.5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Sign in to accept
            </a>
            <p className="text-text-tertiary mt-2 text-center text-xs">
              You must sign in with the invited email address.
            </p>
          </div>
        )}

        {isAuthenticated && !emailMatches && (
          <div className="border-error/30 bg-error/10 mt-6 rounded-xl border p-4 text-center">
            <p className="text-error text-sm">
              You are signed in as <strong>{userEmail}</strong>, but this invitation is for{" "}
              <strong>{invite.email}</strong>.
            </p>
            <button
              type="button"
              onClick={() => {
                void signOutAndSwitchAccount()
              }}
              className="text-accent mt-3 text-sm font-medium hover:underline"
            >
              Switch account
            </button>
          </div>
        )}

        {isAuthenticated && emailMatches && (
          <div className="mt-6">
            <button
              onClick={() => {
                acceptInvitation.mutate(
                  { token },
                  {
                    onSuccess: () => {
                      void navigate({ to: "/dashboard" })
                    },
                  },
                )
              }}
              disabled={acceptInvitation.isPending}
              className="bg-accent w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {acceptInvitation.isPending ? "Accepting..." : "Accept invitation"}
            </button>
            {acceptInvitation.isError && (
              <p className="text-error mt-2 text-center text-sm">
                {acceptInvitation.error.message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
