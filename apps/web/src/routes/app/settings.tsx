/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { useEffect, useState, type ReactNode } from "react"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import { useDashboardSettings, useUpdateDashboardSettings } from "@/lib/api"

export function SettingsPage() {
  const { workspace, workspaceId, isLoading: workspacesLoading } = useCurrentWorkspace()
  const settingsQuery = useDashboardSettings(workspaceId)
  const updateSettings = useUpdateDashboardSettings(workspaceId)

  const [quotaGb, setQuotaGb] = useState("10")
  const [maxFileSizeMb, setMaxFileSizeMb] = useState("5120")
  const [chunkSizeMb, setChunkSizeMb] = useState("5")
  const [defaultShareExpirationDays, setDefaultShareExpirationDays] = useState("30")
  const [trashRetentionDays, setTrashRetentionDays] = useState("30")
  const [enablePublicSignup, setEnablePublicSignup] = useState(false)
  const [allowedMimeTypes, setAllowedMimeTypes] = useState("")
  const [brandingName, setBrandingName] = useState("")
  const [brandingLogoUrl, setBrandingLogoUrl] = useState("")
  const [r2PublicBaseUrl, setR2PublicBaseUrl] = useState("")

  useEffect(() => {
    const settings = settingsQuery.data
    if (!settings) return

    setQuotaGb(String(settings.storageQuotaBytes / (1024 * 1024 * 1024)))
    setMaxFileSizeMb(String(settings.maxFileSizeBytes / (1024 * 1024)))
    setChunkSizeMb(String(settings.uploadChunkSizeBytes / (1024 * 1024)))
    setDefaultShareExpirationDays(String(settings.defaultShareExpirationDays))
    setTrashRetentionDays(String(settings.trashRetentionDays))
    setEnablePublicSignup(settings.enablePublicSignup)
    setAllowedMimeTypes(settings.allowedMimeTypes.join(", "))
    setBrandingName(settings.brandingName ?? "")
    setBrandingLogoUrl(settings.brandingLogoUrl ?? "")
    setR2PublicBaseUrl(settings.r2PublicBaseUrl ?? "")
  }, [settingsQuery.data])

  if (workspacesLoading || settingsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-text-tertiary">No workspace found</p>
      </div>
    )
  }

  const settings = settingsQuery.data
  if (!settings) {
    return null
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Workspace Settings</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Update quota, upload policy, retention, branding, and public signup behavior.
        </p>
      </div>

      <form
        className="grid gap-6 rounded-2xl border border-border-default bg-surface-default p-6"
        onSubmit={(event) => {
          event.preventDefault()
          updateSettings.mutate({
            ...settings,
            storageQuotaBytes: Math.max(Number(quotaGb) || 0, 1) * 1024 * 1024 * 1024,
            maxFileSizeBytes: Math.max(Number(maxFileSizeMb) || 0, 1) * 1024 * 1024,
            uploadChunkSizeBytes: Math.max(Number(chunkSizeMb) || 0, 1) * 1024 * 1024,
            defaultShareExpirationDays: Math.max(Number(defaultShareExpirationDays) || 1, 1),
            trashRetentionDays: Math.max(Number(trashRetentionDays) || 1, 1),
            enablePublicSignup,
            allowedMimeTypes: allowedMimeTypes
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean),
            brandingName: brandingName.trim() || null,
            brandingLogoUrl: brandingLogoUrl.trim() || null,
            r2PublicBaseUrl: r2PublicBaseUrl.trim().replace(/\/+$/, "") || null,
          })
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Storage quota (GB)">
            <input
              value={quotaGb}
              onChange={(event) => setQuotaGb(event.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Max file size (MB)">
            <input
              value={maxFileSizeMb}
              onChange={(event) => setMaxFileSizeMb(event.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Upload chunk size (MB)">
            <input
              value={chunkSizeMb}
              onChange={(event) => setChunkSizeMb(event.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Default share expiration (days)">
            <input
              value={defaultShareExpirationDays}
              onChange={(event) => setDefaultShareExpirationDays(event.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Trash retention (days)">
            <input
              value={trashRetentionDays}
              onChange={(event) => setTrashRetentionDays(event.target.value)}
              className={inputClasses}
            />
          </Field>
        </div>

        <Field label="Allowed MIME types">
          <textarea
            value={allowedMimeTypes}
            onChange={(event) => setAllowedMimeTypes(event.target.value)}
            rows={4}
            placeholder="image/png, application/pdf"
            className={`${inputClasses} resize-none`}
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Branding name">
            <input
              value={brandingName}
              onChange={(event) => setBrandingName(event.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Branding logo URL">
            <input
              value={brandingLogoUrl}
              onChange={(event) => setBrandingLogoUrl(event.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="R2 public domain">
            <input
              value={r2PublicBaseUrl}
              onChange={(event) => setR2PublicBaseUrl(event.target.value)}
              placeholder="https://files.example.com"
              className={inputClasses}
            />
          </Field>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-border-muted bg-bg-tertiary px-4 py-3 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={enablePublicSignup}
            onChange={(event) => setEnablePublicSignup(event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Enable public signup for this workspace
        </label>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-tertiary">
            Size inputs are entered as GB/MB and converted to bytes on save.
          </p>
          <button
            type="submit"
            disabled={updateSettings.isPending}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updateSettings.isPending ? "Saving..." : "Save settings"}
          </button>
        </div>
      </form>

      {(settingsQuery.isError || updateSettings.isError) && (
        <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          {settingsQuery.error?.message ?? updateSettings.error?.message}
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      {children}
    </label>
  )
}

const inputClasses =
  "rounded-xl border border-border-default bg-bg-tertiary px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent"
