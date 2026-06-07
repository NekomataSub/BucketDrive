/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { useState } from "react"
import {
  usePlatformSettings,
  useUpdatePlatformSettings,
  usePlatformInvitations,
  useCreatePlatformInvitation,
  useUploadPlatformAsset,
} from "@/lib/api"
import { Users, Settings, Copy, Check, Upload, Image } from "lucide-react"
import { ActionButton, PageHeader } from "@/components/shared/page-layout"

export function PlatformAdminPage() {
  const { data: settings, isLoading } = usePlatformSettings()
  const updateSettings = useUpdatePlatformSettings()
  const uploadAsset = useUploadPlatformAsset()
  const { data: invitationsData } = usePlatformInvitations()
  const createInvitation = useCreatePlatformInvitation()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("viewer")

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="border-accent h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Platform Administration"
        title="Platform Settings"
        description="Manage platform-wide branding, signup behavior, and platform invitations."
      />

      <section className="grid gap-6 md:grid-cols-2">
        <div className="border-border-default bg-surface-default rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <Settings className="text-text-secondary h-5 w-5" />
            <h2 className="text-text-primary text-base font-semibold">General</h2>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-text-secondary block text-sm font-medium">Platform name</label>
              <input
                type="text"
                defaultValue={settings?.platformName}
                onBlur={(e) => {
                  if (e.target.value !== settings?.platformName) {
                    void updateSettings.mutate({ platformName: e.target.value })
                  }
                }}
                className="border-border-default bg-bg-primary text-text-primary focus:border-accent mt-1 block w-full rounded-xl border px-3 py-2 text-sm outline-none"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AssetUpload
                label="Platform logo"
                previewUrl={settings?.platformLogoUrl}
                disabled={uploadAsset.isPending}
                onSelect={(file) => {
                  uploadAsset.mutate({ kind: "logo", file })
                }}
              />
              <AssetUpload
                label="Platform favicon"
                previewUrl={settings?.faviconUrl}
                disabled={uploadAsset.isPending}
                onSelect={(file) => {
                  uploadAsset.mutate({ kind: "favicon", file })
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-primary text-sm font-medium">Platform public signup</p>
                <p className="text-text-tertiary text-xs">Allow users to join without invitation</p>
              </div>
              <button
                type="button"
                aria-pressed={Boolean(settings?.enablePublicSignup)}
                disabled={updateSettings.isPending}
                onClick={() => {
                  void updateSettings.mutate({ enablePublicSignup: !settings?.enablePublicSignup })
                }}
                className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${settings?.enablePublicSignup ? "bg-accent" : "bg-border-default"}`}
              >
                <span
                  className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${settings?.enablePublicSignup ? "translate-x-5" : ""}`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="border-border-default bg-surface-default rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <Users className="text-text-secondary h-5 w-5" />
            <h2 className="text-text-primary text-base font-semibold">Platform Invitations</h2>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!inviteEmail.trim()) return
              void createInvitation.mutate(
                {
                  email: inviteEmail.trim(),
                  role: inviteRole,
                },
                {
                  onSuccess: () => {
                    setInviteEmail("")
                    setInviteRole("viewer")
                  },
                },
              )
            }}
            className="mt-4 space-y-3"
          >
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value)
              }}
              placeholder="user@example.com"
              required
              className="border-border-default bg-bg-primary text-text-primary focus:border-accent block w-full rounded-xl border px-3 py-2 text-sm outline-none"
            />
            <div className="flex gap-2">
              <select
                value={inviteRole}
                onChange={(e) => {
                  setInviteRole(e.target.value)
                }}
                className="border-border-default bg-bg-primary text-text-primary focus:border-accent rounded-xl border px-3 py-2 text-sm outline-none"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {createInvitation.isError && (
              <p className="text-error text-sm">{createInvitation.error?.message ?? "Failed"}</p>
            )}
            <ActionButton
              type="submit"
              variant="primary"
              disabled={createInvitation.isPending}
              loading={createInvitation.isPending}
              loadingLabel="Creating..."
              className="w-full"
            >
              Generate platform invite link
            </ActionButton>
          </form>
        </div>
      </section>

      <section className="border-border-default bg-surface-default rounded-2xl border p-5">
        <h2 className="text-text-primary text-base font-semibold">Pending Invitations</h2>
        <div className="mt-4 space-y-2">
          {(invitationsData?.data?.length ?? 0) === 0 ? (
            <p className="text-text-tertiary text-sm">No pending invitations.</p>
          ) : (
            (invitationsData?.data ?? []).map(
              (inv: { id: string; email: string; role: string; inviteLink?: string }) => (
                <div
                  key={inv.id}
                  className="border-border-muted bg-bg-tertiary flex items-center justify-between rounded-xl border px-4 py-3"
                >
                  <div>
                    <p className="text-text-primary text-sm font-medium">{inv.email}</p>
                    <p className="text-text-tertiary text-xs">Role: {inv.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const link = inv.inviteLink ?? `${window.location.origin}/join`
                      void navigator.clipboard.writeText(link)
                      setCopiedId(inv.id)
                      setTimeout(() => {
                        setCopiedId(null)
                      }, 2000)
                    }}
                    className="text-accent flex items-center gap-1 text-sm hover:underline"
                  >
                    {copiedId === inv.id ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copiedId === inv.id ? "Copied" : "Copy link"}
                  </button>
                </div>
              ),
            )
          )}
        </div>
      </section>
    </div>
  )
}

function AssetUpload({
  label,
  previewUrl,
  disabled,
  onSelect,
}: {
  label: string
  previewUrl?: string | null
  disabled: boolean
  onSelect: (file: File) => void
}) {
  return (
    <label className="border-border-muted bg-bg-tertiary hover:bg-surface-hover grid cursor-pointer gap-2 rounded-xl border p-3 transition-colors">
      <span className="text-text-secondary flex items-center gap-2 text-sm font-medium">
        <Image className="h-4 w-4" />
        {label}
      </span>
      <span className="flex items-center justify-between gap-3">
        <span className="bg-surface-default flex h-10 w-10 items-center justify-center rounded-lg">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-8 w-8 object-contain" />
          ) : (
            <Image className="text-text-tertiary h-5 w-5" />
          )}
        </span>
        <span className="text-accent inline-flex items-center gap-1 text-xs font-medium">
          <Upload className="h-3.5 w-3.5" />
          Upload
        </span>
      </span>
      <input
        type="file"
        accept="image/*"
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onSelect(file)
          event.target.value = ""
        }}
      />
    </label>
  )
}
