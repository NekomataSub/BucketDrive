/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions */
import * as Dialog from "@radix-ui/react-dialog"
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import {
  AlertTriangle,
  Check,
  Copy,
  Globe,
  Image,
  Link2,
  Lock,
  Pencil,
  Shield,
  Upload,
  Users,
  X,
} from "lucide-react"
import {
  useDashboardSettings,
  useBatchRevokeShares,
  useDeleteShare,
  useShares,
  useUpdateDashboardSettings,
  useUpdateShare,
  useUploadBucketBrandingLogo,
  type WorkspaceData,
} from "@/lib/api"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useMultiSelect } from "@/hooks/use-multi-select"
import { useSearchStore } from "@/stores/search-store"
import { SelectionMarquee } from "@/components/features/selection-marquee"
import {
  ActionButton,
  PageHeader,
  PageToolbar,
  SegmentedControl,
} from "@/components/shared/page-layout"
import { can, type ShareDashboardItem } from "@bucketdrive/shared"

type ShareTab = "mine" | "bucket"

export function ShareManagementPage() {
  const { workspace, workspaceId, isLoading: workspacesLoading } = useCurrentWorkspace()
  const tableRef = useRef<HTMLDivElement>(null)
  const canManageAll = can(workspace?.role ?? "viewer", "shares.manage_all")
  const query = useSearchStore((state) => state.shares.query)
  const debouncedQuery = useDebouncedValue(query.trim(), 300)

  const mineSharesQuery = useShares(workspaceId, { scope: "mine", q: debouncedQuery || undefined })
  const bucketSharesQuery = useShares(workspaceId, {
    scope: "bucket",
    q: debouncedQuery || undefined,
    enabled: canManageAll,
  })
  const settingsQuery = useDashboardSettings(workspaceId)
  const updateSettings = useUpdateDashboardSettings(workspaceId)
  const uploadBrandingLogo = useUploadBucketBrandingLogo(workspaceId)
  const batchRevokeShares = useBatchRevokeShares(workspaceId)

  const [activeTab, setActiveTab] = useState<ShareTab>("mine")
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null)
  const [editingShare, setEditingShare] = useState<ShareDashboardItem | null>(null)
  const [shareBrandingName, setShareBrandingName] = useState("")
  const [shareBrandingLogoUrl, setShareBrandingLogoUrl] = useState("")

  useEffect(() => {
    if (!canManageAll && activeTab === "bucket") {
      setActiveTab("mine")
    }
  }, [activeTab, canManageAll])

  useEffect(() => {
    const settings = settingsQuery.data
    if (!settings) return

    setShareBrandingName(settings.brandingName ?? "")
    setShareBrandingLogoUrl(settings.brandingLogoUrl ?? "")
  }, [settingsQuery.data])

  const currentQuery = activeTab === "bucket" && canManageAll ? bucketSharesQuery : mineSharesQuery

  const shares = currentQuery.data?.data ?? []
  const selectionItems = useMemo(
    () => shares.map((share) => ({ id: share.id, type: "share" })),
    [shares],
  )
  const selection = useMultiSelect({ items: selectionItems, containerRef: tableRef })
  const selectedShareIds = selection.selectedIdsByType("share")
  const selectedShares = shares.filter((share) => selectedShareIds.includes(share.id))
  const isLoading = workspacesLoading || currentQuery.isLoading

  const handleCopyLink = async (share: ShareDashboardItem) => {
    if (share.shareType === "internal") return

    const link = `${window.location.origin}/share/${share.id}`
    await navigator.clipboard.writeText(link)
    setCopiedShareId(share.id)
    window.setTimeout(
      () => setCopiedShareId((current) => (current === share.id ? null : current)),
      2000,
    )
  }

  const handleSaveShareBranding = () => {
    const settings = settingsQuery.data
    if (!settings) return

    updateSettings.mutate({
      ...settings,
      brandingName: shareBrandingName.trim() || null,
      brandingLogoUrl: shareBrandingLogoUrl.trim() || null,
    })
  }

  const handleCopySelectedLinks = async () => {
    const links = selectedShares
      .filter((share) => share.shareType !== "internal")
      .map((share) => `${window.location.origin}/share/${share.id}`)
    if (links.length === 0) return
    await navigator.clipboard.writeText(links.join("\n"))
  }

  const handleRevokeSelected = () => {
    if (selectedShareIds.length === 0) return
    const confirmed = window.confirm(
      `Revoke ${String(selectedShareIds.length)} selected share${selectedShareIds.length === 1 ? "" : "s"}?`,
    )
    if (!confirmed) return
    batchRevokeShares.mutate(
      { shareIds: selectedShareIds },
      { onSuccess: () => selection.clearSelection() },
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="border-accent h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-text-tertiary text-sm">No bucket found</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-6">
      <SelectionMarquee rect={selection.selectionRect} />
      <PageHeader
        title="Share Links"
        description="Manage your active links, expirations, passwords, and revocations."
      />

      <PageToolbar>
        <SegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Share link scope"
          options={[
            { value: "mine", label: "My Shares" },
            ...(canManageAll ? [{ value: "bucket" as const, label: "All Bucket Shares" }] : []),
          ]}
        />
      </PageToolbar>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <StatsCard label="Visible Shares" value={String(currentQuery.data?.meta.total ?? 0)} />
        <StatsCard
          label="Locked Links"
          value={String(shares.filter((share) => share.isLocked).length)}
          tone={shares.some((share) => share.isLocked) ? "warning" : "default"}
        />
        <StatsCard
          label="External Links"
          value={String(shares.filter((share) => share.shareType !== "internal").length)}
        />
        <StatsCard
          label="Total Downloads"
          value={String(
            shares.reduce((sum: number, share: ShareDashboardItem) => sum + share.downloadCount, 0),
          )}
        />
      </div>

      <div className="border-border-default bg-surface-secondary mb-4 rounded-xl border px-4 py-3">
        <p className="text-text-secondary text-sm">
          Internal shares stay inside the bucket and appear in{" "}
          <span className="text-text-primary font-medium">Shared with me</span>. External shares can
          be copied and sent outside the bucket.
        </p>
      </div>

      {selection.selectedCount > 0 && (
        <div className="border-accent bg-accent/10 mb-3 flex items-center gap-2 rounded-lg border px-4 py-2">
          <span className="text-text-primary text-sm font-medium">
            {selection.selectedCount} share{selection.selectedCount === 1 ? "" : "s"} selected
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void handleCopySelectedLinks()}
            disabled={!selectedShares.some((share) => share.shareType !== "internal")}
            className="text-text-secondary hover:bg-surface-hover hover:text-text-primary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy links
          </button>
          <button
            type="button"
            onClick={handleRevokeSelected}
            className="text-error hover:bg-error/10 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            <Shield className="h-3.5 w-3.5" />
            Revoke selected
          </button>
          <button
            type="button"
            onClick={selection.clearSelection}
            className="text-text-tertiary hover:text-text-primary rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {can(workspace.role, "bucket.settings.update") && (
        <section className="border-border-default bg-surface-default mb-4 rounded-xl border p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <h2 className="text-text-primary text-base font-semibold">Share page branding</h2>
              <p className="text-text-tertiary mt-1 text-xs">
                Customize public share pages for this bucket. Empty fields use the platform
                branding.
              </p>
            </div>
            <ActionButton
              variant="primary"
              onClick={handleSaveShareBranding}
              disabled={settingsQuery.isLoading || !settingsQuery.data}
              loading={updateSettings.isPending}
              loadingLabel="Saving..."
            >
              Save share branding
            </ActionButton>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr]">
            <label className="grid gap-2">
              <span className="text-text-primary text-sm font-medium">Share page name</span>
              <input
                value={shareBrandingName}
                onChange={(event) => setShareBrandingName(event.target.value)}
                placeholder="Use platform name"
                className={settingsInputClasses}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-text-primary text-sm font-medium">Uploaded share logo</span>
              <span className="border-border-muted bg-bg-tertiary hover:bg-surface-hover flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="bg-surface-default flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                    {settingsQuery.data?.brandingLogoAssetUrl || shareBrandingLogoUrl ? (
                      <img
                        src={settingsQuery.data?.brandingLogoAssetUrl ?? shareBrandingLogoUrl}
                        alt=""
                        className="h-8 w-8 object-contain"
                      />
                    ) : (
                      <Image className="text-text-tertiary h-5 w-5" />
                    )}
                  </span>
                  <span className="text-text-secondary truncate text-sm">
                    {uploadBrandingLogo.isPending ? "Uploading..." : "Upload image"}
                  </span>
                </span>
                <Upload className="text-accent h-4 w-4 shrink-0" />
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadBrandingLogo.isPending}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) uploadBrandingLogo.mutate({ file })
                    event.target.value = ""
                  }}
                />
              </span>
            </label>

            <label className="grid gap-2 md:col-span-2 xl:col-span-1">
              <span className="text-text-primary text-sm font-medium">External share logo URL</span>
              <input
                value={shareBrandingLogoUrl}
                onChange={(event) => setShareBrandingLogoUrl(event.target.value)}
                placeholder="Use platform logo"
                className={settingsInputClasses}
              />
            </label>
          </div>

          {(settingsQuery.isError || updateSettings.isError || uploadBrandingLogo.isError) && (
            <p className="text-error mt-3 text-sm">
              {settingsQuery.error?.message ??
                updateSettings.error?.message ??
                uploadBrandingLogo.error?.message}
            </p>
          )}
        </section>
      )}

      {shares.length === 0 ? (
        <EmptyState tab={activeTab} workspace={workspace} />
      ) : (
        <div
          ref={tableRef}
          onPointerDown={selection.handleContainerPointerDown}
          onPointerMove={selection.handleContainerPointerMove}
          onPointerUp={selection.handleContainerPointerUp}
          onPointerCancel={selection.handleContainerPointerCancel}
          className="border-border-default min-h-[calc(100vh-520px)] overflow-hidden rounded-xl border"
        >
          <table className="w-full">
            <thead data-selection-ignore>
              <tr className="border-border-muted bg-surface-default border-b">
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                  Resource
                </th>
                <th className="text-text-tertiary hidden px-4 py-3 text-left text-xs font-medium lg:table-cell">
                  Access
                </th>
                <th className="text-text-tertiary hidden px-4 py-3 text-left text-xs font-medium xl:table-cell">
                  Created
                </th>
                <th className="text-text-tertiary hidden px-4 py-3 text-left text-xs font-medium lg:table-cell">
                  Accesses
                </th>
                <th className="text-text-tertiary hidden px-4 py-3 text-left text-xs font-medium lg:table-cell">
                  Downloads
                </th>
                <th className="text-text-tertiary hidden px-4 py-3 text-left text-xs font-medium xl:table-cell">
                  Last access
                </th>
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                  Status
                </th>
                <th className="text-text-tertiary w-48 px-4 py-3 text-right text-xs font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {shares.map((share, index) => (
                <ShareRow
                  key={share.id}
                  share={share}
                  index={index}
                  copied={copiedShareId === share.id}
                  showCreator={activeTab === "bucket"}
                  isSelected={selection.isSelected({ id: share.id, type: "share" })}
                  onRowClick={(event) =>
                    selection.handleItemClick({ id: share.id, type: "share" }, index, event)
                  }
                  onCopyLink={handleCopyLink}
                  onEdit={() => setEditingShare(share)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ShareSettingsDialog
        workspaceId={workspace.id}
        share={editingShare}
        open={editingShare !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingShare(null)
          }
        }}
      />
    </div>
  )
}

function StatsCard({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "warning"
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        tone === "warning"
          ? "border-warning/40 bg-warning/10"
          : "border-border-default bg-surface-default"
      }`}
    >
      <p className="text-text-tertiary text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className="text-text-primary mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function EmptyState({ tab, workspace }: { tab: ShareTab; workspace: WorkspaceData }) {
  return (
    <div className="border-border-default bg-surface-default flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
      <Link2 className="text-text-tertiary h-10 w-10" />
      <p className="text-text-primary text-sm font-medium">
        {tab === "bucket" ? "No bucket shares yet" : "You have not created any shares yet"}
      </p>
      <p className="text-text-tertiary max-w-xl text-xs">
        {tab === "bucket"
          ? `${workspace.name} does not have any active or historical links in this scope yet.`
          : "Create a share from the explorer context menu to manage it here."}
      </p>
    </div>
  )
}

function ShareRow({
  share,
  index: _index,
  copied,
  showCreator,
  isSelected,
  onRowClick,
  onCopyLink,
  onEdit,
}: {
  share: ShareDashboardItem
  index: number
  copied: boolean
  showCreator: boolean
  isSelected: boolean
  onRowClick: (event: MouseEvent<HTMLTableRowElement>) => void
  onCopyLink: (share: ShareDashboardItem) => Promise<void>
  onEdit: () => void
}) {
  const isExpired = share.expiresAt ? new Date(share.expiresAt) < new Date() : false
  const canCopy = share.shareType !== "internal"

  return (
    <tr
      data-selectable-item
      data-item-id={share.id}
      data-item-type="share"
      onClick={onRowClick}
      className={`border-border-muted hover:bg-surface-hover border-b align-top transition-colors last:border-b-0 ${
        isSelected ? "bg-accent/10" : ""
      }`}
    >
      <td className="px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-lg">
            {share.resourceType === "folder" ? "\uD83D\uDCC2" : "\uD83D\uDCC4"}
          </span>
          <div className="min-w-0">
            <p className="text-text-primary truncate text-sm font-medium">{share.resourceName}</p>
            <div className="text-text-tertiary mt-1 flex flex-wrap items-center gap-2 text-xs">
              <ShareTypeBadge shareType={share.shareType} />
              <span className="capitalize">{share.resourceType}</span>
              {showCreator && <span>by {share.createdByName}</span>}
            </div>
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3 lg:table-cell">
        <div className="flex flex-wrap gap-1.5">
          {share.permissions.length === 0 ? (
            <span className="text-text-tertiary text-sm">Link access</span>
          ) : (
            share.permissions.map((permission) => (
              <span
                key={permission}
                className="bg-surface-hover text-text-secondary rounded-full px-2 py-0.5 text-xs capitalize"
              >
                {permission}
              </span>
            ))
          )}
        </div>
      </td>
      <td className="hidden px-4 py-3 xl:table-cell">
        <div className="text-text-secondary text-sm">
          <p>{new Date(share.createdAt).toLocaleDateString()}</p>
          <p className="text-text-tertiary text-xs">{share.createdByName}</p>
        </div>
      </td>
      <td className="text-text-secondary hidden px-4 py-3 text-sm lg:table-cell">
        {share.accessCount}
      </td>
      <td className="text-text-secondary hidden px-4 py-3 text-sm lg:table-cell">
        {share.downloadCount}
      </td>
      <td className="text-text-secondary hidden px-4 py-3 text-sm xl:table-cell">
        {share.lastAccessedAt ? new Date(share.lastAccessedAt).toLocaleString() : "Never"}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {!share.isActive && <StatusBadge tone="muted" label="Revoked" />}
          {share.isActive && !isExpired && <StatusBadge tone="success" label="Active" />}
          {isExpired && <StatusBadge tone="warning" label="Expired" />}
          {share.hasPassword && <StatusBadge tone="default" label="Password" />}
          {share.isLocked && <StatusBadge tone="warning" label="Locked" />}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2" data-selection-ignore>
          {canCopy && (
            <button
              onClick={(event) => {
                event.stopPropagation()
                void onCopyLink(share)
              }}
              className="border-border-muted text-text-secondary hover:bg-surface-default hover:text-text-primary inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
            >
              {copied ? (
                <Check className="text-success h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          <button
            onClick={(event) => {
              event.stopPropagation()
              onEdit()
            }}
            className="border-border-muted text-text-secondary hover:bg-surface-default hover:text-text-primary inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
      </td>
    </tr>
  )
}

function ShareTypeBadge({ shareType }: { shareType: ShareDashboardItem["shareType"] }) {
  if (shareType === "internal") {
    return (
      <span className="bg-surface-hover text-text-secondary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
        <Users className="h-3 w-3" />
        Internal
      </span>
    )
  }

  return (
    <span className="bg-accent/10 text-accent inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
      <Globe className="h-3 w-3" />
      {shareType === "external_direct" ? "Public file" : "Public folder"}
    </span>
  )
}

function StatusBadge({
  label,
  tone,
}: {
  label: string
  tone: "default" | "success" | "warning" | "muted"
}) {
  const className =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "warning"
        ? "bg-warning/10 text-warning"
        : tone === "muted"
          ? "bg-text-tertiary/10 text-text-tertiary"
          : "bg-surface-hover text-text-secondary"

  return <span className={`rounded-full px-2 py-0.5 text-xs ${className}`}>{label}</span>
}

function ShareSettingsDialog({
  workspaceId,
  share,
  open,
  onOpenChange,
}: {
  workspaceId: string
  share: ShareDashboardItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const updateShare = useUpdateShare(workspaceId)
  const revokeShare = useDeleteShare(workspaceId)
  const [expiresAtInput, setExpiresAtInput] = useState("")
  const [password, setPassword] = useState("")
  const [removePassword, setRemovePassword] = useState(false)

  useEffect(() => {
    if (!share) return
    setExpiresAtInput(toDateTimeLocalValue(share.expiresAt))
    setPassword("")
    setRemovePassword(false)
  }, [share])

  const isExternal = share?.shareType !== "internal"
  const isSubmitting = updateShare.isPending || revokeShare.isPending

  const handleSave = () => {
    if (!share) return

    const payload: {
      shareId: string
      expiresAt?: string | null
      password?: string | null
    } = {
      shareId: share.id,
      expiresAt: expiresAtInput ? new Date(expiresAtInput).toISOString() : null,
    }

    if (isExternal) {
      if (removePassword) {
        payload.password = null
      } else if (password.trim()) {
        payload.password = password.trim()
      }
    }

    updateShare.mutate(payload, {
      onSuccess: () => onOpenChange(false),
    })
  }

  const handleRevoke = () => {
    if (!share) return
    const confirmed = window.confirm("This will immediately disable access. Continue?")
    if (!confirmed) return

    revokeShare.mutate(
      { shareId: share.id },
      {
        onSuccess: () => onOpenChange(false),
      },
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="border-border-default bg-surface-default fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-text-primary text-lg font-semibold">
                Manage share
              </Dialog.Title>
              <Dialog.Description className="text-text-tertiary mt-1 text-sm">
                {share?.resourceName}
              </Dialog.Description>
            </div>
            <Dialog.Close className="text-text-tertiary hover:bg-surface-hover hover:text-text-primary rounded-md p-1 transition-colors">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {share && (
            <div className="space-y-5">
              <div className="border-border-default bg-surface-secondary rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <ShareTypeBadge shareType={share.shareType} />
                  {share.hasPassword && (
                    <span className="bg-surface-hover text-text-secondary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
                      <Lock className="h-3 w-3" />
                      Password protected
                    </span>
                  )}
                  {share.isLocked && (
                    <span className="bg-warning/10 text-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
                      <AlertTriangle className="h-3 w-3" />
                      Locked after failed attempts
                    </span>
                  )}
                </div>
                <div className="text-text-secondary mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <InfoRow label="Created" value={new Date(share.createdAt).toLocaleString()} />
                  <InfoRow label="Access count" value={String(share.accessCount)} />
                  <InfoRow label="Download count" value={String(share.downloadCount)} />
                  <InfoRow
                    label="Last access"
                    value={
                      share.lastAccessedAt
                        ? new Date(share.lastAccessedAt).toLocaleString()
                        : "Never"
                    }
                  />
                  <InfoRow
                    label="Expiration"
                    value={share.expiresAt ? new Date(share.expiresAt).toLocaleString() : "Never"}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="share-expiration"
                  className="text-text-tertiary text-xs font-medium tracking-wide uppercase"
                >
                  Expiration
                </label>
                <input
                  id="share-expiration"
                  type="datetime-local"
                  value={expiresAtInput}
                  onChange={(event) => setExpiresAtInput(event.target.value)}
                  className="border-border-default bg-surface-default text-text-primary focus:border-accent focus:ring-accent mt-1.5 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                />
                <p className="text-text-tertiary mt-1 text-xs">
                  Clear this field to keep the share active until you revoke it.
                </p>
              </div>

              {isExternal && (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="share-password"
                      className="text-text-tertiary text-xs font-medium tracking-wide uppercase"
                    >
                      Rotate password
                    </label>
                    <input
                      id="share-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Leave blank to keep the current password"
                      className="border-border-default bg-surface-default text-text-primary placeholder:text-text-tertiary focus:border-accent focus:ring-accent mt-1.5 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                    />
                  </div>

                  <label className="border-border-muted text-text-secondary flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={removePassword}
                      onChange={(event) => setRemovePassword(event.target.checked)}
                      disabled={!share.hasPassword}
                      className="border-border-default bg-surface-default text-accent focus:ring-accent h-4 w-4 rounded"
                    />
                    Remove password protection
                  </label>
                </div>
              )}

              {(updateShare.isError || revokeShare.isError) && (
                <p className="text-error text-sm">
                  {updateShare.error instanceof Error
                    ? updateShare.error.message
                    : revokeShare.error instanceof Error
                      ? revokeShare.error.message
                      : "Failed to update this share"}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={handleRevoke}
                  disabled={isSubmitting || !share.isActive}
                  className="border-error/40 text-error hover:bg-error/10 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Shield className="h-4 w-4" />
                  Revoke share
                </button>
                <div className="flex gap-3">
                  <Dialog.Close className="border-border-muted text-text-secondary hover:bg-surface-hover rounded-lg border px-4 py-2 text-sm font-medium transition-colors">
                    Cancel
                  </Dialog.Close>
                  <button
                    onClick={handleSave}
                    disabled={
                      isSubmitting || (password.trim().length > 0 && password.trim().length < 4)
                    }
                    className="bg-accent hover:bg-accent/90 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updateShare.isPending ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-text-tertiary text-xs tracking-wide uppercase">{label}</p>
      <p className="text-text-primary mt-1 text-sm">{value}</p>
    </div>
  )
}

const settingsInputClasses =
  "rounded-xl border border-border-default bg-bg-tertiary px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent"

function toDateTimeLocalValue(value: string | null) {
  if (!value) return ""

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")

  return `${year}-${month}-${day}T${hours}:${minutes}`
}
