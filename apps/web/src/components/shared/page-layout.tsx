import type { ButtonHTMLAttributes, ReactNode } from "react"

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost"

interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  actions?: ReactNode
}

interface PageToolbarProps {
  children: ReactNode
  className?: string
}

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: ReactNode
  loading?: boolean
  loadingLabel?: string
}

interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  ariaLabel?: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: Array<SegmentOption<T>>
  onChange: (value: T) => void
  ariaLabel: string
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent/90",
  secondary:
    "border border-border-muted bg-surface-default text-text-primary hover:bg-surface-hover",
  danger: "border border-error/40 text-error hover:bg-error/10",
  ghost: "text-text-tertiary hover:bg-surface-hover hover:text-text-primary",
}

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <section className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-text-tertiary text-xs font-medium tracking-[0.24em] uppercase">
            {eyebrow}
          </p>
        )}
        <h1
          className={`text-text-primary font-semibold tracking-tight ${eyebrow ? "mt-2 text-3xl" : "text-lg"}`}
        >
          {title}
        </h1>
        {description && <p className="text-text-tertiary mt-1 text-xs">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  )
}

export function PageToolbar({ children, className = "" }: PageToolbarProps) {
  return (
    <div
      className={`border-border-default bg-surface-default mb-4 flex flex-wrap items-center gap-2 rounded-xl border p-3 ${className}`}
    >
      {children}
    </div>
  )
}

export function ActionButton({
  variant = "secondary",
  icon,
  loading = false,
  loadingLabel,
  children,
  className = "",
  disabled,
  ...props
}: ActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${buttonVariants[variant]} ${className}`}
      {...props}
    >
      {icon}
      {loading ? (loadingLabel ?? children) : children}
    </button>
  )
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      className="border-border-muted bg-surface-default flex rounded-lg border p-0.5"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => {
            onChange(option.value)
          }}
          aria-label={option.ariaLabel}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === option.value
              ? "bg-surface-active text-text-primary"
              : "text-text-tertiary hover:text-text-primary"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
