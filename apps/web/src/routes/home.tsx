/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Link } from "@tanstack/react-router"
import { Upload } from "lucide-react"
import { BrandMark, useBranding } from "@/lib/branding"
import { useI18n } from "@/lib/i18n"

export function HomePage() {
  const branding = useBranding()
  const { t } = useI18n()

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-4">
      <BrandMark className="h-16 w-16" />
      <h1 className="text-text-primary text-3xl font-semibold">{branding.name}</h1>
      <p className="text-text-secondary">{t("home.tagline")}</p>
      <div className="mt-4 flex gap-3">
        <Link
          to="/dashboard/files"
          search={{ folderId: undefined, previewFileId: undefined }}
          className="bg-accent inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          <Upload className="h-4 w-4" />
          {t("home.goToFiles")}
        </Link>
      </div>
    </div>
  )
}
