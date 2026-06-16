/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { useEffect, useState } from "react"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import { useDashboardSettings, useUpdateDashboardSettings } from "@/lib/api"
import { ActionButton, PageHeader } from "@/components/shared/page-layout"
import { Field, Panel, TextAreaField, TextField } from "@/components/shared/ui-primitives"
import { getWorkspaceCapabilities, normalizeWorkspaceRole } from "@/lib/workspace-permissions"
import { useI18n } from "@/lib/i18n"

export function SettingsPage() {
  const {
    workspace,
    workspaceId,
    isLoading: workspacesLoading,
    isError: workspacesError,
    error: workspacesErrorDetail,
  } = useCurrentWorkspace()
  const settingsQuery = useDashboardSettings(workspaceId)
  const updateSettings = useUpdateDashboardSettings(workspaceId)
  const capabilities = getWorkspaceCapabilities(
    normalizeWorkspaceRole(workspace?.role),
    Boolean(workspace),
  )
  const canUpdateSettings = capabilities.canUpdateSettings
  const { t } = useI18n()

  const [quotaGb, setQuotaGb] = useState("10")
  const [maxFileSizeMb, setMaxFileSizeMb] = useState("5120")
  const [chunkSizeMb, setChunkSizeMb] = useState("5")
  const [defaultShareExpirationDays, setDefaultShareExpirationDays] = useState("30")
  const [trashRetentionDays, setTrashRetentionDays] = useState("30")
  const [allowedMimeTypes, setAllowedMimeTypes] = useState("")
  const [r2PublicBaseUrl, setR2PublicBaseUrl] = useState("")

  useEffect(() => {
    const settings = settingsQuery.data
    if (!settings) return

    setQuotaGb(String(settings.storageQuotaBytes / (1024 * 1024 * 1024)))
    setMaxFileSizeMb(String(settings.maxFileSizeBytes / (1024 * 1024)))
    setChunkSizeMb(String(settings.uploadChunkSizeBytes / (1024 * 1024)))
    setDefaultShareExpirationDays(String(settings.defaultShareExpirationDays))
    setTrashRetentionDays(String(settings.trashRetentionDays))
    setAllowedMimeTypes(settings.allowedMimeTypes.join(", "))
    setR2PublicBaseUrl(settings.r2PublicBaseUrl ?? "")
  }, [settingsQuery.data])

  if (workspacesLoading || settingsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="border-accent h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  if (workspacesError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-error text-sm">
          {workspacesErrorDetail?.message ?? t("platform.loadError")}
        </p>
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-text-tertiary text-sm">{t("settings.noBucket")}</p>
      </div>
    )
  }

  const settings = settingsQuery.data
  if (!settings) {
    return null
  }

  return (
    <div className="flex h-full min-w-0 flex-col p-4 sm:p-6">
      <PageHeader
        title={t("settings.title")}
        description={t("settings.description")}
        actions={
          <ActionButton
            type="submit"
            form="bucket-settings-form"
            variant="primary"
            disabled={updateSettings.isPending || !canUpdateSettings}
            loading={updateSettings.isPending}
            loadingLabel={t("app.saving")}
          >
            {t("settings.save")}
          </ActionButton>
        }
      />

      <form
        id="bucket-settings-form"
        className="mb-4 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!canUpdateSettings) return
          updateSettings.mutate({
            ...settings,
            storageQuotaBytes: Math.max(Number(quotaGb) || 0, 1) * 1024 * 1024 * 1024,
            maxFileSizeBytes: Math.max(Number(maxFileSizeMb) || 0, 1) * 1024 * 1024,
            uploadChunkSizeBytes: Math.max(Number(chunkSizeMb) || 0, 1) * 1024 * 1024,
            defaultShareExpirationDays: Math.max(Number(defaultShareExpirationDays) || 1, 1),
            trashRetentionDays: Math.max(Number(trashRetentionDays) || 1, 1),
            enablePublicSignup: settings.enablePublicSignup,
            allowedMimeTypes: allowedMimeTypes
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean),
            brandingName: settings.brandingName,
            brandingLogoUrl: settings.brandingLogoUrl,
            r2PublicBaseUrl: r2PublicBaseUrl.trim().replace(/\/+$/, "") || null,
          })
        }}
      >
        {!canUpdateSettings && (
          <div className="border-border-default bg-surface-secondary text-text-secondary rounded-lg border px-4 py-3 text-sm">
            {t("settings.readOnly")}
          </div>
        )}

        <Panel>
          <h2 className="text-text-primary text-base font-semibold">
            {t("settings.storageUploads")}
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label={t("settings.storageQuota")} description={t("settings.gbMinimum")}>
              <TextField
                type="number"
                min={1}
                step={1}
                value={quotaGb}
                disabled={!canUpdateSettings}
                onChange={(event) => setQuotaGb(event.target.value)}
              />
            </Field>
            <Field label={t("settings.maxFileSize")} description={t("settings.mbMinimum")}>
              <TextField
                type="number"
                min={1}
                step={1}
                value={maxFileSizeMb}
                disabled={!canUpdateSettings}
                onChange={(event) => setMaxFileSizeMb(event.target.value)}
              />
            </Field>
            <Field label={t("settings.uploadChunkSize")} description={t("settings.mbMinimum")}>
              <TextField
                type="number"
                min={1}
                step={1}
                value={chunkSizeMb}
                disabled={!canUpdateSettings}
                onChange={(event) => setChunkSizeMb(event.target.value)}
              />
            </Field>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-text-primary text-base font-semibold">
            {t("settings.sharingRetention")}
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label={t("settings.defaultShareExpiration")}
              description={t("settings.daysMinimum")}
            >
              <TextField
                type="number"
                min={1}
                step={1}
                value={defaultShareExpirationDays}
                disabled={!canUpdateSettings}
                onChange={(event) => setDefaultShareExpirationDays(event.target.value)}
              />
            </Field>
            <Field label={t("settings.trashRetention")} description={t("settings.daysMinimum")}>
              <TextField
                type="number"
                min={1}
                step={1}
                value={trashRetentionDays}
                disabled={!canUpdateSettings}
                onChange={(event) => setTrashRetentionDays(event.target.value)}
              />
            </Field>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-text-primary text-base font-semibold">{t("settings.filePolicy")}</h2>
          <div className="mt-4 grid gap-4">
            <Field
              label={t("settings.allowedMimeTypes")}
              description={t("settings.allowedMimeTypesDescription")}
            >
              <TextAreaField
                value={allowedMimeTypes}
                disabled={!canUpdateSettings}
                onChange={(event) => setAllowedMimeTypes(event.target.value)}
                rows={4}
                placeholder="image/png, application/pdf"
                className="resize-none"
              />
            </Field>
            {allowedMimeTypes
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {allowedMimeTypes
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean)
                  .map((entry) => (
                    <span
                      key={entry}
                      className="bg-surface-secondary text-text-secondary rounded-full px-3 py-1 text-xs font-medium"
                    >
                      {entry}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <h2 className="text-text-primary text-base font-semibold">
            {t("settings.publicObjectDelivery")}
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label={t("settings.r2PublicDomain")}
              description={t("settings.r2PublicDomainDescription")}
            >
              <TextField
                type="url"
                value={r2PublicBaseUrl}
                disabled={!canUpdateSettings}
                onChange={(event) => setR2PublicBaseUrl(event.target.value)}
                placeholder="https://files.example.com"
              />
            </Field>
          </div>
        </Panel>
      </form>

      {(settingsQuery.isError || updateSettings.isError) && (
        <div className="border-error/40 bg-error/10 text-error rounded-xl border px-4 py-3 text-sm">
          {settingsQuery.error?.message ?? updateSettings.error?.message}
        </div>
      )}
    </div>
  )
}
