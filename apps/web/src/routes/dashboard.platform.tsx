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
import { StyledSelect } from "@/components/shared/styled-select"
import { Field } from "@/components/shared/ui-primitives"
import { useI18n, type LanguageCode } from "@/lib/i18n"

export function PlatformAdminPage() {
  const { data: settings, isLoading } = usePlatformSettings()
  const updateSettings = useUpdatePlatformSettings()
  const uploadAsset = useUploadPlatformAsset()
  const { data: invitationsData } = usePlatformInvitations()
  const createInvitation = useCreatePlatformInvitation()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("viewer")
  const { t } = useI18n()

  const platformInviteRoleOptions = [
    { value: "viewer", label: t("role.viewer") },
    { value: "editor", label: t("role.editor") },
    { value: "manager", label: t("role.manager") },
    { value: "admin", label: t("role.admin") },
  ]

  const languageOptions = [
    { value: "en-US", label: t("language.en-US") },
    { value: "pt-BR", label: t("language.pt-BR") },
  ]

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="border-accent h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow={t("platform.eyebrow")}
        title={t("platform.title")}
        description={t("platform.description")}
      />

      <section className="grid gap-6 md:grid-cols-2">
        <div className="border-border-default bg-surface-default rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <Settings className="text-text-secondary h-5 w-5" />
            <h2 className="text-text-primary text-base font-semibold">{t("platform.general")}</h2>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-text-secondary block text-sm font-medium">
                {t("platform.name")}
              </label>
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
                label={t("platform.logo")}
                previewUrl={settings?.platformLogoUrl}
                disabled={uploadAsset.isPending}
                onSelect={(file) => {
                  uploadAsset.mutate({ kind: "logo", file })
                }}
              />
              <AssetUpload
                label={t("platform.favicon")}
                previewUrl={settings?.faviconUrl}
                disabled={uploadAsset.isPending}
                onSelect={(file) => {
                  uploadAsset.mutate({ kind: "favicon", file })
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-primary text-sm font-medium">
                  {t("platform.publicSignup")}
                </p>
                <p className="text-text-tertiary text-xs">
                  {t("platform.publicSignupDescription")}
                </p>
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
            <Field label={t("platform.language")} description={t("platform.languageDescription")}>
              <StyledSelect
                value={settings?.defaultLanguage ?? "en-US"}
                onValueChange={(value) => {
                  void updateSettings.mutate({ defaultLanguage: value as LanguageCode })
                }}
                options={languageOptions}
                triggerClassName="bg-bg-primary"
              />
            </Field>
          </div>
        </div>

        <div className="border-border-default bg-surface-default rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <Users className="text-text-secondary h-5 w-5" />
            <h2 className="text-text-primary text-base font-semibold">
              {t("platform.invitations")}
            </h2>
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
              <StyledSelect
                value={inviteRole}
                onValueChange={setInviteRole}
                options={platformInviteRoleOptions}
                triggerClassName="bg-bg-primary"
              />
            </div>
            {createInvitation.isError && (
              <p className="text-error text-sm">{createInvitation.error?.message ?? "Failed"}</p>
            )}
            <ActionButton
              type="submit"
              variant="primary"
              disabled={createInvitation.isPending}
              loading={createInvitation.isPending}
              loadingLabel={t("platform.creating")}
              className="w-full"
            >
              {t("platform.generateInvite")}
            </ActionButton>
          </form>
        </div>
      </section>

      <section className="border-border-default bg-surface-default rounded-2xl border p-5">
        <h2 className="text-text-primary text-base font-semibold">
          {t("platform.pendingInvitations")}
        </h2>
        <div className="mt-4 space-y-2">
          {(invitationsData?.data?.length ?? 0) === 0 ? (
            <p className="text-text-tertiary text-sm">{t("platform.noPendingInvitations")}</p>
          ) : (
            (invitationsData?.data ?? []).map(
              (inv: { id: string; email: string; role: string; inviteLink?: string }) => (
                <div
                  key={inv.id}
                  className="border-border-muted bg-bg-tertiary flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-text-primary text-sm font-medium">{inv.email}</p>
                    <p className="text-text-tertiary text-xs">
                      {t("platform.role", { role: inv.role })}
                    </p>
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
                    {copiedId === inv.id ? t("app.copied") : t("platform.copyLink")}
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
  const { t } = useI18n()

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
          {t("app.upload")}
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
