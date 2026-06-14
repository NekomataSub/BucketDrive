import * as Dialog from "@radix-ui/react-dialog"
import { AlertTriangle, X } from "lucide-react"

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  variant?: "default" | "danger"
  loading?: boolean
  loadingLabel?: string
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  loadingLabel,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  const confirmClassName =
    variant === "danger"
      ? "bg-error text-white hover:bg-error/90"
      : "bg-accent text-white hover:bg-accent/90"

  const handleOpenChange = (nextOpen: boolean) => {
    if (loading && !nextOpen) return
    onOpenChange(nextOpen)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="border-border-default bg-surface-default fixed top-1/2 left-1/2 z-[61] max-h-[calc(100dvh-2rem)] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-5 shadow-xl">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                variant === "danger" ? "bg-error/10 text-error" : "bg-accent/10 text-accent"
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-text-primary text-base font-semibold">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-text-tertiary mt-1 text-sm leading-5">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close confirmation"
              disabled={loading}
              className="text-text-tertiary hover:bg-surface-hover hover:text-text-primary rounded-md p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Dialog.Close
              disabled={loading}
              className="border-border-muted text-text-secondary hover:bg-surface-hover rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLabel}
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`${confirmClassName} rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {loading ? (loadingLabel ?? confirmLabel) : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
