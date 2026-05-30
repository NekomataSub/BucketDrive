/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { useState } from "react"
import {
  usePlatformSettings,
  useUpdatePlatformSettings,
  usePlatformInvitations,
  useCreatePlatformInvitation,
} from "@/lib/api"
import { Users, Settings, Copy, Check } from "lucide-react"

export function PlatformAdminPage() {
  const { data: settings, isLoading } = usePlatformSettings()
  const updateSettings = useUpdatePlatformSettings()
  const { data: invitationsData } = usePlatformInvitations()
  const createInvitation = useCreatePlatformInvitation()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("viewer")
  const [inviteCanCreate, setInviteCanCreate] = useState(false)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <section>
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-tertiary">Platform Administration</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">Platform Settings</h1>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border-default bg-surface-default p-5">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-text-secondary" />
            <h2 className="text-base font-semibold text-text-primary">General</h2>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary">Platform Name</label>
              <input
                type="text"
                defaultValue={settings?.platformName}
                onBlur={(e) => {
                  if (e.target.value !== settings?.platformName) {
                    void updateSettings.mutate({ platformName: e.target.value })
                  }
                }}
                className="mt-1 block w-full rounded-xl border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Allow Workspace Creation</p>
                <p className="text-xs text-text-tertiary">Let users create their own workspaces</p>
              </div>
              <button
                type="button"
                aria-pressed={Boolean(settings?.allowUserWorkspaceCreation)}
                disabled={updateSettings.isPending}
                onClick={() => { void updateSettings.mutate({ allowUserWorkspaceCreation: !settings?.allowUserWorkspaceCreation }) }}
                className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${settings?.allowUserWorkspaceCreation ? "bg-accent" : "bg-border-default"}`}
              >
                <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${settings?.allowUserWorkspaceCreation ? "translate-x-5" : ""}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Public Signup</p>
                <p className="text-xs text-text-tertiary">Allow users to join without invitation</p>
              </div>
              <button
                type="button"
                aria-pressed={Boolean(settings?.enablePublicSignup)}
                disabled={updateSettings.isPending}
                onClick={() => { void updateSettings.mutate({ enablePublicSignup: !settings?.enablePublicSignup }) }}
                className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${settings?.enablePublicSignup ? "bg-accent" : "bg-border-default"}`}
              >
                <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${settings?.enablePublicSignup ? "translate-x-5" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border-default bg-surface-default p-5">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-text-secondary" />
            <h2 className="text-base font-semibold text-text-primary">Invite User</h2>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!inviteEmail.trim()) return
              void createInvitation.mutate(
                { email: inviteEmail.trim(), role: inviteRole, canCreateWorkspaces: inviteCanCreate },
                {
                  onSuccess: () => {
                    setInviteEmail("")
                    setInviteRole("viewer")
                    setInviteCanCreate(false)
                  },
                },
              )
            }}
            className="mt-4 space-y-3"
          >
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value) }}
              placeholder="user@example.com"
              required
              className="block w-full rounded-xl border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <select
                value={inviteRole}
                onChange={(e) => { setInviteRole(e.target.value) }}
                className="rounded-xl border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={inviteCanCreate}
                  onChange={(e) => { setInviteCanCreate(e.target.checked) }}
                  className="h-4 w-4 rounded border-border-default"
                />
                Can create workspaces
              </label>
            </div>
            {createInvitation.isError && (
              <p className="text-sm text-error">{createInvitation.error?.message ?? "Failed"}</p>
            )}
            <button
              type="submit"
              disabled={createInvitation.isPending}
              className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {createInvitation.isPending ? "Creating..." : "Generate invite link"}
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-border-default bg-surface-default p-5">
        <h2 className="text-base font-semibold text-text-primary">Pending Invitations</h2>
        <div className="mt-4 space-y-2">
          {(invitationsData?.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-text-tertiary">No pending invitations.</p>
          ) : (
            (invitationsData?.data ?? []).map((inv: { id: string; email: string; role: string; canCreateWorkspaces: boolean; inviteLink?: string }) => (
              <div key={inv.id} className="flex items-center justify-between rounded-xl border border-border-muted bg-bg-tertiary px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">{inv.email}</p>
                  <p className="text-xs text-text-tertiary">Role: {inv.role} {inv.canCreateWorkspaces ? "(can create workspaces)" : ""}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const link = inv.inviteLink ?? `${window.location.origin}/join`
                    void navigator.clipboard.writeText(link)
                    setCopiedId(inv.id)
                    setTimeout(() => { setCopiedId(null) }, 2000)
                  }}
                  className="flex items-center gap-1 text-sm text-accent hover:underline"
                >
                  {copiedId === inv.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedId === inv.id ? "Copied" : "Copy link"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
