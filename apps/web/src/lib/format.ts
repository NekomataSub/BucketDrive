export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"] as const
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index

  return `${value.toFixed(index === 0 ? 0 : 1)} ${String(units[index])}`
}

export function formatRelativeDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days < 0) return date.toLocaleDateString()
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${String(days)} days ago`

  return date.toLocaleDateString()
}

export function formatShortDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function formatPercent(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return "0%"

  return `${String(Math.round((value / total) * 100))}%`
}

export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "\uD83D\uDDBC"
  if (mimeType.startsWith("video/")) return "\uD83C\uDFAC"
  if (mimeType.startsWith("audio/")) return "\uD83C\uDFB5"
  if (mimeType.includes("pdf")) return "\uD83D\uDCC4"
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "\uD83D\uDCCA"
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "\uD83D\uDCBD"
  if (mimeType.startsWith("text/")) return "\uD83D\uDCDD"

  return "\uD83D\uDCC1"
}
