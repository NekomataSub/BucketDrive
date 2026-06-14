/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import * as Dialog from "@radix-ui/react-dialog"
import { X, Copy, Check, Share2, Globe, Lock, Download } from "lucide-react"
import { useState, useCallback } from "react"
import { useCreateShare, useDashboardSettings } from "@/lib/api"
import { StyledSelect } from "@/components/shared/styled-select"

type ExternalShareType = "external_direct" | "external_explorer"

interface ShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  resourceId: string
  resourceType: "file" | "folder"
  resourceName: string
  resourceStorageKey?: string
}

const shareTypeLabels: Record<ExternalShareType, { label: string; description: string }> = {
  external_direct: {
    label: "External link",
    description: "Anyone with the link can access",
  },
  external_explorer: {
    label: "External folder",
    description: "Browse folder contents via public link",
  },
}

const expirationOptions = [
  { value: "", label: "Never" },
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
]

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
  const [password, setPassword] = useState("")
  const [expiresIn, setExpiresIn] = useState<string>("")
  const [copiedLinkType, setCopiedLinkType] = useState<"share" | "download" | "public" | null>(null)
  const [createdShareId, setCreatedShareId] = useState<string | null>(null)
  const [createdShareType, setCreatedShareType] = useState<ExternalShareType | null>(null)
  const shareType: ExternalShareType =
    resourceType === "file" ? "external_direct" : "external_explorer"

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
        password: password ? password : undefined,
        expiresAt: getExpiresAt(),
      },
      {
        onSuccess: (data) => {
          setCreatedShareId(data.id)
          setCreatedShareType(shareType)
        },
      },
    )
  }, [resourceId, resourceType, shareType, password, expiresIn, createShare])

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
    return `${window.location.origin}/share/${createdShareId ?? ""}`
  }, [createdShareId])

  const getManagedDownloadLink = useCallback(() => {
    if (!createdShareId || createdShareType !== "external_direct") return null
    return `${window.location.origin}/api/shares/${createdShareId}/download`
  }, [createdShareId, createdShareType])

  const reset = () => {
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
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="border-border-default bg-surface-default data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-xl">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-text-primary text-lg font-semibold">
              Share &ldquo;{resourceName}&rdquo;
            </Dialog.Title>
            <Dialog.Close className="text-text-tertiary hover:bg-surface-hover hover:text-text-primary rounded-md p-1 transition-colors">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {!createdShareId ? (
            <div className="space-y-5">
              <div>
                <p className="text-text-secondary mb-2 text-sm">Share type</p>
                <div className="border-accent bg-accent/10 text-accent flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium">
                  <Globe className="h-4 w-4" />
                  {shareTypeLabels[shareType].label}
                </div>
                <p className="text-text-tertiary mt-1.5 text-xs">
                  {shareTypeLabels[shareType].description}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="share-password"
                    className="text-text-secondary flex items-center gap-1.5 text-xs font-medium"
                  >
                    <Lock className="h-3 w-3" />
                    Password protection
                  </label>
                  <input
                    id="share-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Optional: password (min 4 chars)"
                    className="border-border-default bg-surface-default text-text-primary placeholder:text-text-tertiary focus:border-accent focus:ring-accent mt-1.5 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                  />
                  {password.length > 0 && password.length < 4 && (
                    <p className="text-error mt-1 text-xs">
                      Password must be at least 4 characters
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="share-expiration"
                    className="text-text-secondary text-xs font-medium"
                  >
                    Expiration
                  </label>
                  <StyledSelect
                    id="share-expiration"
                    value={expiresIn}
                    onValueChange={setExpiresIn}
                    options={expirationOptions}
                    triggerClassName="mt-1.5 w-full rounded-lg bg-surface-default"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Dialog.Close className="border-border-muted text-text-secondary hover:bg-surface-hover rounded-lg border px-4 py-2 text-sm font-medium transition-colors">
                  Cancel
                </Dialog.Close>
                <button
                  onClick={handleCreate}
                  disabled={createShare.isPending || (password.length > 0 && password.length < 4)}
                  className="bg-accent hover:bg-accent/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
                >
                  <Share2 className="h-4 w-4" />
                  {createShare.isPending ? "Creating..." : "Create share"}
                </button>
              </div>

              {createShare.isError && (
                <p className="text-error text-sm">
                  {createShare.error instanceof Error
                    ? createShare.error.message
                    : "Failed to create share"}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="border-border-muted bg-surface-secondary rounded-lg border p-4">
                <p className="text-text-secondary mb-1 text-xs font-medium">Share link created</p>
                <p className="text-text-primary text-sm">
                  Anyone with the link can access this content.
                </p>
              </div>

              <button
                type="button"
                onClick={() => copyLink(getShareLink(), "share")}
                className="border-border-default bg-surface-default text-text-primary hover:bg-surface-hover inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
              >
                {copiedLinkType === "share" ? (
                  <>
                    <Check className="text-success h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="text-text-tertiary h-4 w-4" />
                    Copy share link
                  </>
                )}
              </button>

              {resourceType === "file" && createdShareType === "external_direct" && (
                <div className="grid gap-2">
                  {getManagedDownloadLink() && password.length === 0 && (
                    <button
                      onClick={() => {
                        const link = getManagedDownloadLink()
                        if (link) copyLink(link, "download")
                      }}
                      className="border-border-default bg-surface-default text-text-primary hover:bg-surface-hover inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
                    >
                      {copiedLinkType === "download" ? (
                        <>
                          <Check className="text-success h-4 w-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Download className="text-text-tertiary h-4 w-4" />
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
                      className="border-border-default bg-surface-default text-text-primary hover:bg-surface-hover inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
                    >
                      {copiedLinkType === "public" ? (
                        <>
                          <Check className="text-success h-4 w-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Globe className="text-text-tertiary h-4 w-4" />
                          Copy public R2 URL
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <Dialog.Close className="bg-accent hover:bg-accent/90 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors">
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
