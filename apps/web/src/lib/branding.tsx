import { useEffect } from "react"
import { FolderOpen } from "lucide-react"
import { usePlatformSettings } from "./api"
import { DEFAULT_BRAND_NAME } from "@bucketdrive/shared/constants"
export { DEFAULT_BRAND_NAME } from "@bucketdrive/shared/constants"

interface BrandingState {
  name: string
  logoUrl: string | null
  faviconUrl: string
  isLoading: boolean
}

export function useBranding(): BrandingState {
  const settings = usePlatformSettings()
  return {
    name: settings.data?.platformName ?? DEFAULT_BRAND_NAME,
    logoUrl: settings.data?.platformLogoUrl ?? null,
    faviconUrl: settings.data?.faviconUrl ?? "/favicon.svg",
    isLoading: settings.isLoading,
  }
}

export function BrandingEffects() {
  const branding = useBranding()

  useEffect(() => {
    document.title = branding.name

    const selector = 'link[rel="icon"]'
    let link = document.querySelector<HTMLLinkElement>(selector)
    if (!link) {
      link = document.createElement("link")
      link.rel = "icon"
      document.head.append(link)
    }
    link.href = branding.faviconUrl
  }, [branding.faviconUrl, branding.name])

  return null
}

export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  const branding = useBranding()

  if (branding.logoUrl) {
    return <img src={branding.logoUrl} alt="" className={`${className} object-contain`} />
  }

  return <FolderOpen className={`${className} text-accent`} />
}
