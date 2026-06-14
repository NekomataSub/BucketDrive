/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/restrict-template-expressions */
import * as Dialog from "@radix-ui/react-dialog"
import { Check, Copy, Globe, Lock, Share2, X } from "lucide-react"
import { useState } from "react"
import { useCreateShare } from "@/lib/api"
import { StyledSelect } from "@/components/shared/styled-select"

interface BatchShareItem {
  id: string
  type: "file" | "folder"
  name: string
}

interface BatchShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  items: BatchShareItem[]
}

const expirationOptions = [
  { value: "", label: "Never" },
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
]

export function BatchShareDialog({
  open,
  onOpenChange,
  workspaceId,
  items,
}: BatchShareDialogProps) {
  const createShare = useCreateShare(workspaceId)
  const [password, setPassword] = useState("")
  const [expiresIn, setExpiresIn] = useState("")
  const [links, setLinks] = useState<Array<{ name: string; link: string }>>([])
  const [failed, setFailed] = useState<Array<{ name: string; message: string }>>([])
  const [copied, setCopied] = useState(false)
  const [hasCreated, setHasCreated] = useState(false)

  const reset = () => {
    setPassword("")
    setExpiresIn("")
    setLinks([])
    setFailed([])
    setCopied(false)
    setHasCreated(false)
    createShare.reset()
  }

  const getExpiresAt = () => {
    if (!expiresIn) return undefined
    const days = Number.parseInt(expiresIn, 10)
    if (Number.isNaN(days)) return undefined
    const date = new Date()
    date.setDate(date.getDate() + days)
    return date.toISOString()
  }

  const handleCreate = async () => {
    const nextLinks: Array<{ name: string; link: string }> = []
    const nextFailed: Array<{ name: string; message: string }> = []

    for (const item of items) {
      try {
        const share = await createShare.mutateAsync({
          resourceId: item.id,
          resourceType: item.type,
          shareType: item.type === "file" ? "external_direct" : "external_explorer",
          password: password ? password : undefined,
          expiresAt: getExpiresAt(),
        })
        nextLinks.push({
          name: item.name,
          link: `${window.location.origin}/share/${share.id}`,
        })
      } catch (error) {
        nextFailed.push({
          name: item.name,
          message: error instanceof Error ? error.message : "Failed to create share",
        })
      }
    }

    setLinks(nextLinks)
    setFailed(nextFailed)
    setHasCreated(true)
  }

  const copyLinks = () => {
    void navigator.clipboard.writeText(links.map((entry) => entry.link).join("\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) reset()
        onOpenChange(nextOpen)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="border-border-default bg-surface-default fixed top-1/2 left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-xl">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-text-primary text-lg font-semibold">
              Share selected items
            </Dialog.Title>
            <Dialog.Close className="text-text-tertiary hover:bg-surface-hover hover:text-text-primary rounded-md p-1 transition-colors">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {!hasCreated ? (
            <div className="space-y-5">
              <p className="text-text-secondary text-sm">
                Create individual shares for {String(items.length)} selected item
                {items.length === 1 ? "" : "s"}.
              </p>

              <div>
                <p className="text-text-secondary mb-2 text-sm">Share type</p>
                <div className="border-accent bg-accent/10 text-accent flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium">
                  <Globe className="h-4 w-4" />
                  External links
                </div>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-text-secondary flex items-center gap-1.5 text-xs font-medium">
                    <Lock className="h-3 w-3" />
                    Password protection
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Optional: password (min 4 chars)"
                    className="border-border-default bg-surface-default text-text-primary placeholder:text-text-tertiary focus:border-accent mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-text-secondary text-xs font-medium">Expiration</span>
                  <StyledSelect
                    value={expiresIn}
                    onValueChange={setExpiresIn}
                    options={expirationOptions}
                    triggerClassName="mt-1.5 w-full rounded-lg bg-surface-default"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3">
                <Dialog.Close className="border-border-muted text-text-secondary hover:bg-surface-hover rounded-lg border px-4 py-2 text-sm font-medium transition-colors">
                  Cancel
                </Dialog.Close>
                <button
                  type="button"
                  onClick={() => {
                    void handleCreate()
                  }}
                  disabled={
                    createShare.isPending ||
                    items.length === 0 ||
                    (password.length > 0 && password.length < 4)
                  }
                  className="bg-accent hover:bg-accent/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
                >
                  <Share2 className="h-4 w-4" />
                  {createShare.isPending ? "Creating..." : "Create shares"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {links.length > 0 && (
                <>
                  <div className="border-border-muted bg-surface-secondary max-h-56 overflow-auto rounded-lg border p-3">
                    {links.map((entry) => (
                      <div key={entry.link} className="py-2 first:pt-0 last:pb-0">
                        <p className="text-text-primary truncate text-sm font-medium">
                          {entry.name}
                        </p>
                        <p className="text-text-tertiary truncate text-xs">{entry.link}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={copyLinks}
                    className="border-border-default bg-surface-default text-text-primary hover:bg-surface-hover inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="text-success h-4 w-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="text-text-tertiary h-4 w-4" />
                        Copy all links
                      </>
                    )}
                  </button>
                </>
              )}

              {failed.length > 0 && (
                <div className="border-error/40 bg-error/10 text-error rounded-lg border p-3 text-sm">
                  {String(failed.length)} item{failed.length === 1 ? "" : "s"} could not be shared.
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
