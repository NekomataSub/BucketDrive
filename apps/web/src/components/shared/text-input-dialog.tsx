import * as Dialog from "@radix-ui/react-dialog"
import { useEffect, useId, useState } from "react"
import { X } from "lucide-react"

interface TextInputDialogProps {
  open: boolean
  title: string
  description?: string
  label: string
  initialValue?: string
  placeholder?: string
  confirmLabel: string
  loading?: boolean
  loadingLabel?: string
  error?: string
  onSubmit: (value: string) => void
  onOpenChange: (open: boolean) => void
}

export function TextInputDialog({
  open,
  title,
  description,
  label,
  initialValue = "",
  placeholder,
  confirmLabel,
  loading = false,
  loadingLabel,
  error,
  onSubmit,
  onOpenChange,
}: TextInputDialogProps) {
  const inputId = useId()
  const [value, setValue] = useState(initialValue)
  const trimmedValue = value.trim()

  useEffect(() => {
    if (open) setValue(initialValue)
  }, [initialValue, open])

  const handleOpenChange = (nextOpen: boolean) => {
    if (loading && !nextOpen) return
    onOpenChange(nextOpen)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="border-border-default bg-surface-default fixed top-1/2 left-1/2 z-[61] max-h-[calc(100dvh-2rem)] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-5 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
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
              aria-label="Close dialog"
              disabled={loading}
              className="text-text-tertiary hover:bg-surface-hover hover:text-text-primary rounded-md p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!trimmedValue) return
              onSubmit(trimmedValue)
            }}
          >
            <label htmlFor={inputId} className="grid gap-2">
              <span className="text-text-primary text-sm font-medium">{label}</span>
              <input
                id={inputId}
                autoFocus
                value={value}
                onChange={(event) => {
                  setValue(event.target.value)
                }}
                placeholder={placeholder}
                disabled={loading}
                className="border-border-default bg-surface-default text-text-primary placeholder:text-text-tertiary focus:border-accent focus:ring-accent rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            {error && <p className="text-error text-sm">{error}</p>}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Dialog.Close
                disabled={loading}
                className="border-border-muted text-text-secondary hover:bg-surface-hover rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                disabled={loading || !trimmedValue}
                className="bg-accent hover:bg-accent/90 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (loadingLabel ?? confirmLabel) : confirmLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
