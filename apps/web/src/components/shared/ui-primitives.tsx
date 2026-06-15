import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react"

interface PanelProps {
  children: ReactNode
  className?: string
}

interface FieldProps {
  label: string
  description?: string
  children: ReactNode
}

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export const inputClasses =
  "rounded-lg border border-border-default bg-bg-tertiary px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"

export function Panel({ children, className = "" }: PanelProps) {
  return (
    <section
      className={`border-border-default bg-surface-default rounded-lg border p-4 ${className}`}
    >
      {children}
    </section>
  )
}

export function Field({ label, description, children }: FieldProps) {
  return (
    <label className="grid gap-2">
      <span className="text-text-primary text-sm font-medium">{label}</span>
      {children}
      {description && <span className="text-text-tertiary text-xs leading-5">{description}</span>}
    </label>
  )
}

export function TextField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClasses} ${props.className ?? ""}`} />
}

export function TextAreaField(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClasses} ${props.className ?? ""}`} />
}

export function EmptyState({ title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`border-border-default flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center ${className}`}
    >
      <p className="text-text-primary text-sm font-medium">{title}</p>
      {description && (
        <p className="text-text-tertiary max-w-md text-sm leading-5">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
