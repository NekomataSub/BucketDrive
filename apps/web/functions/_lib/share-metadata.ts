export const DEFAULT_BRAND_NAME = "BucketDrive"
export const NO_INDEX_DIRECTIVES = "noindex, nofollow, noarchive, nosnippet"
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

export interface ShareInfo {
  id: string
  resourceType: "file" | "folder"
  resourceName: string
  shareType: "internal" | "external_direct" | "external_explorer"
  hasPassword: boolean
  isActive: boolean
  expiresAt: string | null
  createdAt: string
  brandingLogoUrl: string | null
  brandingName: string | null
}

export interface ShareMetadata {
  title: string
  description: string
  brandName: string
  resourceName: string | null
  resourceLabel: string
  hasPassword: boolean
  isUnavailable: boolean
}

export function buildShareMetadata(info: ShareInfo | null): ShareMetadata {
  if (!info || !info.isActive || isExpired(info.expiresAt)) {
    return {
      title: "Share unavailable",
      description: "This BucketDrive share link is no longer available.",
      brandName: DEFAULT_BRAND_NAME,
      resourceName: null,
      resourceLabel: "Share",
      hasPassword: false,
      isUnavailable: true,
    }
  }

  const brandName = cleanText(info.brandingName) || DEFAULT_BRAND_NAME
  const resourceName = cleanText(info.resourceName) || "Shared item"
  const resourceLabel = info.resourceType === "folder" ? "Folder" : "File"
  const passwordSuffix = info.hasPassword ? " Password required." : ""

  return {
    title: `${resourceName} shared via ${brandName}`,
    description: `Secure shared ${info.resourceType.toLowerCase()} on ${brandName}.${passwordSuffix}`,
    brandName,
    resourceName,
    resourceLabel,
    hasPassword: info.hasPassword,
    isUnavailable: false,
  }
}

export function buildShareHeadTags(params: {
  metadata: ShareMetadata
  pageUrl: string
  imageUrl: string
}): string {
  const { metadata, pageUrl, imageUrl } = params
  return [
    `<meta name="robots" content="${NO_INDEX_DIRECTIVES}" />`,
    `<meta name="description" content="${escapeHtmlAttribute(metadata.description)}" />`,
    `<link rel="canonical" href="${escapeHtmlAttribute(pageUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtmlAttribute(metadata.brandName)}" />`,
    `<meta property="og:title" content="${escapeHtmlAttribute(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtmlAttribute(metadata.description)}" />`,
    `<meta property="og:url" content="${escapeHtmlAttribute(pageUrl)}" />`,
    `<meta property="og:image" content="${escapeHtmlAttribute(imageUrl)}" />`,
    `<meta property="og:image:width" content="${String(OG_IMAGE_WIDTH)}" />`,
    `<meta property="og:image:height" content="${String(OG_IMAGE_HEIGHT)}" />`,
    `<meta property="og:image:alt" content="${escapeHtmlAttribute(metadata.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtmlAttribute(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtmlAttribute(metadata.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtmlAttribute(imageUrl)}" />`,
  ].join("\n    ")
}

export function injectShareHead(html: string, title: string, headTags: string): string {
  const withTitle = html.replace(
    /<title>.*?<\/title>/i,
    `<title>${escapeHtmlText(title)}</title>`,
  )
  return withTitle.replace(/<head>/i, `<head>\n    ${headTags}`)
}

export function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

export function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', "&quot;")
}

function cleanText(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim().replace(/\s+/g, " ")
  return trimmed.length > 0 ? trimmed : null
}

function isExpired(expiresAt: string | null): boolean {
  return Boolean(expiresAt && expiresAt < new Date().toISOString())
}
