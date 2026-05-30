/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions */
import * as Dialog from "@radix-ui/react-dialog"
import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Check,
  Copy,
  Globe,
  Link2,
  Lock,
  Pencil,
  Shield,
  Users,
  X,
} from "lucide-react"
import {
  useDeleteShare,
  useShares,
  useUpdateShare,
    type WorkspaceData,
 } from "@/lib/api"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useSearchStore } from "@/stores/search-store"
import { can, type ShareDashboardItem } from "@bucketdrive/shared"

type ShareTab = "mine" | "workspace"

export function ShareManagementPage() {
  const { workspace, workspaceId, isLoading: workspacesLoading } = useCurrentWorkspace()
  const canManageAll = can(workspace?.role ?? "viewer", "shares.manage_all")
  const query = useSearchStore((state) => state.shares.query)
  const debouncedQuery = useDebouncedValue(query.trim(), 300)

  const mineSharesQuery = useShares(workspaceId, { scope: "mine", q: debouncedQuery || undefined })
  const workspaceSharesQuery = useShares(workspaceId, {
    scope: "workspace",
    q: debouncedQuery || undefined,
    enabled: canManageAll,
  })

  const [activeTab, setActiveTab] = useState<ShareTab>("mine")
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null)
  const [editingShare, setEditingShare] = useState<ShareDashboardItem | null>(null)

  useEffect(() => {
    if (!canManageAll && activeTab === "workspace") {
      setActiveTab("mine")
    }
  }, [activeTab, canManageAll])

  const currentQuery =
    activeTab === "workspace" && canManageAll ? workspaceSharesQuery : mineSharesQuery

  const shares = currentQuery.data?.data ?? []
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

  if (isLoading) {
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

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Share Links</h1>
          <p className="text-xs text-text-tertiary">
            Manage your active links, expirations, passwords, and revocations.
          </p>
        </div>
        <div className="flex rounded-lg border border-border-muted bg-surface-default p-0.5">
          <button
            onClick={() => setActiveTab("mine")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "mine"
                ? "bg-surface-active text-text-primary"
                : "text-text-tertiary hover:text-text-primary"
            }`}
          >
            My Shares
          </button>
          {canManageAll && (
            <button
              onClick={() => setActiveTab("workspace")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === "workspace"
                  ? "bg-surface-active text-text-primary"
                  : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              All Workspace Shares
            </button>
          )}
        </div>
      </div>

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
            shares.reduce(
              (sum: number, share: ShareDashboardItem) => sum + share.downloadCount,
              0,
            ),
          )}
        />
      </div>

      <div className="mb-4 rounded-xl border border-border-default bg-surface-secondary px-4 py-3">
        <p className="text-sm text-text-secondary">
          Internal shares stay inside the workspace and appear in{" "}
          <span className="font-medium text-text-primary">Shared with me</span>.{" "}
          External shares can be copied and sent outside the workspace.
        </p>
      </div>

      {shares.length === 0 ? (
        <EmptyState tab={activeTab} workspace={workspace} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-default">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-muted bg-surface-default">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Resource</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-text-tertiary lg:table-cell">
                  Access
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-text-tertiary xl:table-cell">
                  Created
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-text-tertiary lg:table-cell">
                  Accesses
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-text-tertiary lg:table-cell">
                  Downloads
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-text-tertiary xl:table-cell">
                  Last access
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Status</th>
                <th className="w-48 px-4 py-3 text-right text-xs font-medium text-text-tertiary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {shares.map((share) => (
                <ShareRow
                  key={share.id}
                  share={share}
                  copied={copiedShareId === share.id}
                  showCreator={activeTab === "workspace"}
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
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  )
}

function EmptyState({ tab, workspace }: { tab: ShareTab; workspace: WorkspaceData }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-default bg-surface-default p-10 text-center">
      <Link2 className="h-10 w-10 text-text-tertiary" />
      <p className="text-sm font-medium text-text-primary">
        {tab === "workspace" ? "No workspace shares yet" : "You have not created any shares yet"}
      </p>
      <p className="max-w-xl text-xs text-text-tertiary">
        {tab === "workspace"
          ? `${workspace.name} does not have any active or historical links in this scope yet.`
          : "Create a share from the explorer context menu to manage it here."}
      </p>
    </div>
  )
}

function ShareRow({
  share,
  copied,
  showCreator,
  onCopyLink,
  onEdit,
}: {
  share: ShareDashboardItem
  copied: boolean
  showCreator: boolean
  onCopyLink: (share: ShareDashboardItem) => Promise<void>
  onEdit: () => void
}) {
  const isExpired = share.expiresAt ? new Date(share.expiresAt) < new Date() : false
  const canCopy = share.shareType !== "internal"

  return (
    <tr className="border-b border-border-muted align-top transition-colors last:border-b-0 hover:bg-surface-hover">
      <td className="px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-lg">
            {share.resourceType === "folder" ? "\uD83D\uDCC2" : "\uD83D\uDCC4"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">{share.resourceName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
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
            <span className="text-sm text-text-tertiary">Link access</span>
          ) : (
            share.permissions.map((permission) => (
              <span
                key={permission}
                className="rounded-full bg-surface-hover px-2 py-0.5 text-xs capitalize text-text-secondary"
              >
                {permission}
              </span>
            ))
          )}
        </div>
      </td>
      <td className="hidden px-4 py-3 xl:table-cell">
        <div className="text-sm text-text-secondary">
          <p>{new Date(share.createdAt).toLocaleDateString()}</p>
          <p className="text-xs text-text-tertiary">{share.createdByName}</p>
        </div>
      </td>
      <td className="hidden px-4 py-3 lg:table-cell text-sm text-text-secondary">
        {share.accessCount}
      </td>
      <td className="hidden px-4 py-3 lg:table-cell text-sm text-text-secondary">
        {share.downloadCount}
      </td>
      <td className="hidden px-4 py-3 xl:table-cell text-sm text-text-secondary">
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
        <div className="flex justify-end gap-2">
          {canCopy && (
            <button
              onClick={() => void onCopyLink(share)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-default hover:text-text-primary"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-default hover:text-text-primary"
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
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary">
        <Users className="h-3 w-3" />
        Internal
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
      <Globe className="h-3 w-3" />
      {shareType === "external_direct" ? "Public file" : "Public folder"}
    </span>
  )
}

function StatusBadge({ label, tone }: { label: string; tone: "default" | "success" | "warning" | "muted" }) {
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-surface-default p-6 shadow-xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-text-primary">
                Manage share
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-tertiary">
                {share?.resourceName}
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {share && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border-default bg-surface-secondary p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <ShareTypeBadge shareType={share.shareType} />
                  {share.hasPassword && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary">
                      <Lock className="h-3 w-3" />
                      Password protected
                    </span>
                  )}
                  {share.isLocked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      Locked after failed attempts
                    </span>
                  )}
                </div>
                <div className="mt-3 grid gap-3 text-sm text-text-secondary sm:grid-cols-2">
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
                  className="text-xs font-medium uppercase tracking-wide text-text-tertiary"
                >
                  Expiration
                </label>
                <input
                  id="share-expiration"
                  type="datetime-local"
                  value={expiresAtInput}
                  onChange={(event) => setExpiresAtInput(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border-default bg-surface-default px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <p className="mt-1 text-xs text-text-tertiary">
                  Clear this field to keep the share active until you revoke it.
                </p>
              </div>

              {isExternal && (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="share-password"
                      className="text-xs font-medium uppercase tracking-wide text-text-tertiary"
                    >
                      Rotate password
                    </label>
                    <input
                      id="share-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Leave blank to keep the current password"
                      className="mt-1.5 w-full rounded-lg border border-border-default bg-surface-default px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <label className="flex items-center gap-2 rounded-lg border border-border-muted px-3 py-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={removePassword}
                      onChange={(event) => setRemovePassword(event.target.checked)}
                      disabled={!share.hasPassword}
                      className="h-4 w-4 rounded border-border-default bg-surface-default text-accent focus:ring-accent"
                    />
                    Remove password protection
                  </label>
                </div>
              )}

              {(updateShare.isError || revokeShare.isError) && (
                <p className="text-sm text-error">
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
                  className="inline-flex items-center gap-2 rounded-lg border border-error/40 px-4 py-2 text-sm font-medium text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Shield className="h-4 w-4" />
                  Revoke share
                </button>
                <div className="flex gap-3">
                  <Dialog.Close className="rounded-lg border border-border-muted px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover">
                    Cancel
                  </Dialog.Close>
                  <button
                    onClick={handleSave}
                    disabled={
                      isSubmitting || (password.trim().length > 0 && password.trim().length < 4)
                    }
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
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
      <p className="text-xs uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-1 text-sm text-text-primary">{value}</p>
    </div>
  )
}

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
