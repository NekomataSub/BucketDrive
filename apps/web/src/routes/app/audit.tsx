/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/restrict-template-expressions */
import { useState } from "react"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import { useDashboardAudit } from "@/lib/api"
import { PageHeader, PageToolbar } from "@/components/shared/page-layout"
import { StyledSelect } from "@/components/shared/styled-select"
import { useI18n } from "@/lib/i18n"

export function AuditPage() {
  const {
    workspace,
    workspaceId,
    isLoading: workspacesLoading,
    isError: workspacesError,
    error: workspacesErrorDetail,
  } = useCurrentWorkspace()
  const [action, setAction] = useState("")
  const [resourceType, setResourceType] = useState("")
  const { t, formatDate } = useI18n()

  const resourceTypeOptions = [
    { value: "", label: t("audit.allResources") },
    { value: "file", label: "file" },
    { value: "folder", label: "folder" },
    { value: "member", label: "member" },
    { value: "bucket", label: "bucket" },
  ]

  const auditQuery = useDashboardAudit(workspaceId, {
    action: action.trim() || undefined,
    resourceType: resourceType || undefined,
    page: 1,
    limit: 50,
  })

  if (workspacesLoading || auditQuery.isLoading) {
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

  const items = auditQuery.data?.data ?? []

  return (
    <div className="flex h-full min-w-0 flex-col p-4 sm:p-6">
      <PageHeader title={t("audit.logTitle")} description={t("audit.description")} />

      <PageToolbar className="flex-col md:flex-row">
        <input
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder={t("audit.filterAction")}
          className="border-border-default bg-bg-tertiary text-text-primary placeholder:text-text-tertiary focus:border-accent focus:ring-accent flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-1"
        />
        <StyledSelect
          value={resourceType}
          onValueChange={setResourceType}
          options={resourceTypeOptions}
          triggerClassName="bg-bg-tertiary py-2.5"
        />
      </PageToolbar>

      <div className="border-border-default bg-surface-default overflow-hidden rounded-2xl border">
        <div className="divide-border-muted divide-y md:hidden">
          {items.map((item) => (
            <div key={item.id} className="space-y-2 p-4">
              <p className="text-text-primary text-sm font-medium break-words">{item.action}</p>
              <p className="text-text-secondary text-xs">{item.actorName ?? item.actorId}</p>
              <p className="text-text-secondary text-xs break-words">
                {item.resourceType}
                {item.resourceId ? ` • ${item.resourceId}` : ""}
              </p>
              <p className="text-text-tertiary text-xs">
                {formatDate(item.createdAt, { dateStyle: "short", timeStyle: "short" })}
              </p>
            </div>
          ))}
        </div>

        <table className="hidden w-full md:table">
          <thead>
            <tr className="border-border-muted bg-bg-tertiary border-b">
              <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                {t("audit.action")}
              </th>
              <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                {t("audit.actor")}
              </th>
              <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                {t("audit.resource")}
              </th>
              <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                {t("audit.timestamp")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-border-muted hover:bg-surface-hover border-b last:border-b-0"
              >
                <td className="text-text-primary px-4 py-3 text-sm font-medium">{item.action}</td>
                <td className="text-text-secondary px-4 py-3 text-sm">
                  {item.actorName ?? item.actorId}
                </td>
                <td className="text-text-secondary px-4 py-3 text-sm">
                  {item.resourceType}
                  {item.resourceId ? ` • ${item.resourceId}` : ""}
                </td>
                <td className="text-text-secondary px-4 py-3 text-sm">
                  {formatDate(item.createdAt, { dateStyle: "short", timeStyle: "short" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {items.length === 0 && (
          <div className="text-text-tertiary px-4 py-8 text-center text-sm">{t("audit.empty")}</div>
        )}
      </div>

      {auditQuery.isError && (
        <div className="border-error/40 bg-error/10 text-error rounded-xl border px-4 py-3 text-sm">
          {auditQuery.error.message}
        </div>
      )}
    </div>
  )
}
