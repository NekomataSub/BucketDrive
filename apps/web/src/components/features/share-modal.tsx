/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import * as Dialog from "@radix-ui/react-dialog"
import { X, Copy, Check, Share2, Globe, Users, Lock, Download } from "lucide-react"
import { useState, useCallback } from "react"
import { useCreateShare, useDashboardSettings } from "@/lib/api"

type ShareType = "internal" | "external_direct" | "external_explorer"

interface ShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  resourceId: string
  resourceType: "file" | "folder"
  resourceName: string
  resourceStorageKey?: string
}

const shareTypeLabels: Record<ShareType, { label: string; description: string }> = {
  internal: {
    label: "Workspace members",
    description: "Share with members of your workspace",
  },
  external_direct: {
    label: "External link",
    description: "Anyone with the link can access",
  },
  external_explorer: {
    label: "External folder",
    description: "Browse folder contents via public link",
  },
}

export function ShareModal({
  open,
  onOpenChange,
  workspaceId,
  resourceId,
  resourceType,
  resourceName,
  resourceStorageKey,
}: ShareModalProps) {
  const createShare = useCreateShare(workspaceId)
  const settingsQuery = useDashboardSettings(workspaceId || null)
  const [shareType, setShareType] = useState<ShareType>("internal")
  const [permissions, setPermissions] = useState<("read" | "download")[]>(["read", "download"])
  const [password, setPassword] = useState("")
  const [expiresIn, setExpiresIn] = useState<string>("")
  const [copiedLinkType, setCopiedLinkType] = useState<"share" | "download" | "public" | null>(null)
  const [createdShareId, setCreatedShareId] = useState<string | null>(null)
  const [createdShareType, setCreatedShareType] = useState<ShareType | null>(null)

  const getExpiresAt = (): string | undefined => {
    if (!expiresIn) return undefined
    const days = parseInt(expiresIn, 10)
    if (isNaN(days)) return undefined
    const date = new Date()
    date.setDate(date.getDate() + days)
    return date.toISOString()
  }

  const handleCreate = useCallback(() => {
    createShare.mutate(
      {
        resourceId,
        resourceType,
        shareType,
        permissions: shareType === "internal" ? permissions : undefined,
        password: shareType !== "internal" && password ? password : undefined,
        expiresAt: shareType !== "internal" ? getExpiresAt() : undefined,
      },
      {
        onSuccess: (data) => {
          setCreatedShareId(data.id)
          setCreatedShareType(shareType)
        },
      },
    )
  }, [resourceId, resourceType, shareType, permissions, password, expiresIn, createShare])

  const buildPublicR2Url = useCallback(() => {
    const baseUrl = String(settingsQuery.data?.r2PublicBaseUrl ?? "").replace(/\/+$/, "")
    if (!baseUrl || !resourceStorageKey) return null
    const encodedKey = resourceStorageKey
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")
    return `${baseUrl}/${encodedKey}`
  }, [resourceStorageKey, settingsQuery.data?.r2PublicBaseUrl])

  const copyLink = useCallback((link: string, type: "share" | "download" | "public") => {
    void navigator.clipboard.writeText(link)
    setCopiedLinkType(type)
    setTimeout(() => setCopiedLinkType(null), 2000)
  }, [])

  const getShareLink = useCallback(() => {
    if (createdShareType === "internal") {
      return `${window.location.origin}/shared`
    }
    return `${window.location.origin}/share/${createdShareId ?? ""}`
  }, [createdShareId, createdShareType])

  const getManagedDownloadLink = useCallback(() => {
    if (!createdShareId || createdShareType !== "external_direct") return null
    return `${window.location.origin}/api/shares/${createdShareId}/download`
  }, [createdShareId, createdShareType])

  const togglePermission = (perm: "read" | "download") => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    )
  }

  const reset = () => {
    setShareType("internal")
    setPermissions(["read", "download"])
    setPassword("")
    setExpiresIn("")
    setCopiedLinkType(null)
    setCreatedShareId(null)
    setCreatedShareType(null)
    createShare.reset()
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(open) => {
        if (!open) reset()
        onOpenChange(open)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-surface-default p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-text-primary">
              Share &ldquo;{resourceName}&rdquo;
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {!createdShareId ? (
            <div className="space-y-5">
              {resourceType === "folder" ? (
                <div>
                  <p className="text-sm text-text-secondary mb-2">Share type</p>
                  <div className="flex gap-2">
                    {(
                      [
                        { value: "internal" as const, icon: Users },
                        { value: "external_explorer" as const, icon: Globe },
                      ] as const
                    ).map(({ value, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setShareType(value)}
                        className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                          shareType === value
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border-muted bg-surface-default text-text-secondary hover:border-border-default"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {shareTypeLabels[value].label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-text-tertiary">
                    {shareTypeLabels[shareType].description}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-text-secondary mb-2">Share type</p>
                  <div className="flex gap-2">
                    {(
                      [
                        { value: "internal" as const, icon: Users },
                        { value: "external_direct" as const, icon: Globe },
                      ] as const
                    ).map(({ value, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setShareType(value)}
                        className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                          shareType === value
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border-muted bg-surface-default text-text-secondary hover:border-border-default"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {shareTypeLabels[value].label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-text-tertiary">
                    {shareTypeLabels[shareType].description}
                  </p>
                </div>
              )}

              {shareType === "internal" && (
                <div>
                  <div className="rounded-lg border border-border-muted bg-surface-secondary p-3">
                    <p className="text-xs font-medium text-text-secondary mb-2">Permissions</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => togglePermission("read")}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          permissions.includes("read")
                            ? "bg-accent text-white"
                            : "border border-border-muted bg-surface-default text-text-secondary hover:border-border-default"
                        }`}
                      >
                        Read
                      </button>
                      <button
                        onClick={() => togglePermission("download")}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          permissions.includes("download")
                            ? "bg-accent text-white"
                            : "border border-border-muted bg-surface-default text-text-secondary hover:border-border-default"
                        }`}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {shareType !== "internal" && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="share-password" className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                      <Lock className="h-3 w-3" />
                      Password protection
                    </label>
                    <input
                      id="share-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Optional: password (min 4 chars)"
                      className="mt-1.5 w-full rounded-lg border border-border-default bg-surface-default px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    {password.length > 0 && password.length < 4 && (
                      <p className="mt-1 text-xs text-error">Password must be at least 4 characters</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="share-expiration" className="text-xs font-medium text-text-secondary">
                      Expiration
                    </label>
                    <select
                      id="share-expiration"
                      value={expiresIn}
                      onChange={(e) => setExpiresIn(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-border-default bg-surface-default px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="">Never</option>
                      <option value="1">1 day</option>
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Dialog.Close className="rounded-lg border border-border-muted px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
                  Cancel
                </Dialog.Close>
                <button
                  onClick={handleCreate}
                  disabled={
                    createShare.isPending ||
                    (shareType !== "internal" && password.length > 0 && password.length < 4)
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  <Share2 className="h-4 w-4" />
                  {createShare.isPending ? "Creating..." : "Create share"}
                </button>
              </div>

              {createShare.isError && (
                <p className="text-sm text-error">
                  {createShare.error instanceof Error
                    ? createShare.error.message
                    : "Failed to create share"}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg border border-border-muted bg-surface-secondary p-4">
                <p className="text-xs font-medium text-text-secondary mb-1">Share link created</p>
                <p className="text-sm text-text-primary">
                  {createdShareType === "internal"
                    ? "Workspace members can now access this content."
                    : "Anyone with the link can access this content."}
                </p>
              </div>

              {createdShareType === "internal" ? (
                <div className="rounded-lg border border-border-muted bg-surface-secondary p-3 text-sm text-text-secondary">
                  This internal share is available to workspace members from the Shared with me page.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => copyLink(getShareLink(), "share")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border-default bg-surface-default px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
                >
                  {copiedLinkType === "share" ? (
                    <>
                      <Check className="h-4 w-4 text-success" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 text-text-tertiary" />
                      Copy share link
                    </>
                  )}
                </button>
              )}

              {resourceType === "file" && createdShareType === "external_direct" && (
                <div className="grid gap-2">
                  {getManagedDownloadLink() && password.length === 0 && (
                    <button
                      onClick={() => {
                        const link = getManagedDownloadLink()
                        if (link) copyLink(link, "download")
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border-default bg-surface-default px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
                    >
                      {copiedLinkType === "download" ? (
                        <>
                          <Check className="h-4 w-4 text-success" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 text-text-tertiary" />
                          Copy direct download link
                        </>
                      )}
                    </button>
                  )}

                  {buildPublicR2Url() && (
                    <button
                      onClick={() => {
                        const link = buildPublicR2Url()
                        if (link) copyLink(link, "public")
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border-default bg-surface-default px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
                    >
                      {copiedLinkType === "public" ? (
                        <>
                          <Check className="h-4 w-4 text-success" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Globe className="h-4 w-4 text-text-tertiary" />
                          Copy public R2 URL
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <Dialog.Close className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90">
                  Done
                </Dialog.Close>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
