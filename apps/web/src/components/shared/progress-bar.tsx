interface ProgressBarProps {
  value: number
  className?: string
  size?: "sm" | "md"
}

export function ProgressBar({ value, className = "", size = "sm" }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))
  const height = size === "sm" ? "h-1" : "h-2"

  return (
    <div className={`bg-surface-hover w-full overflow-hidden rounded-full ${height} ${className}`}>
      <div
        className={`bg-accent h-full rounded-full transition-all duration-300 ease-out ${getWidthClass(clamped)} ${clamped < 100 ? "animate-pulse" : ""}`}
      />
    </div>
  )
}

function getWidthClass(value: number): string {
  const bucket = Math.round(value / 5) * 5
  const widths: Record<number, string> = {
    0: "w-0",
    5: "w-[5%]",
    10: "w-[10%]",
    15: "w-[15%]",
    20: "w-[20%]",
    25: "w-1/4",
    30: "w-[30%]",
    35: "w-[35%]",
    40: "w-[40%]",
    45: "w-[45%]",
    50: "w-1/2",
    55: "w-[55%]",
    60: "w-[60%]",
    65: "w-[65%]",
    70: "w-[70%]",
    75: "w-3/4",
    80: "w-4/5",
    85: "w-[85%]",
    90: "w-[90%]",
    95: "w-[95%]",
    100: "w-full",
  }

  return widths[bucket] ?? "w-0"
}

export function ProgressCircle({ value, size = 24 }: { value: number; size?: number }) {
  const clamped = Math.min(100, Math.max(0, value))
  const radius = (size - 4) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="text-surface-hover"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-accent transition-all duration-300"
        transform={`rotate(-90 ${String(size / 2)} ${String(size / 2)})`}
      />
    </svg>
  )
}
