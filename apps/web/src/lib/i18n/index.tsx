/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react"
import { usePlatformSettings } from "@/lib/api"
import { dictionaries, type LanguageCode, type TranslationKey } from "./dictionaries"

interface I18nContextValue {
  language: LanguageCode
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
  formatNumber: (value: number) => string
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string
}

const DEFAULT_LANGUAGE: LanguageCode = "en-US"
const I18nContext = createContext<I18nContextValue | null>(null)

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}

function normalizeLanguage(value: string | null | undefined): LanguageCode {
  return value === "pt-BR" ? "pt-BR" : DEFAULT_LANGUAGE
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const settings = usePlatformSettings()
  const language = normalizeLanguage(settings.data?.defaultLanguage)

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = useMemo<I18nContextValue>(() => {
    const active = dictionaries[language]
    const fallback = dictionaries[DEFAULT_LANGUAGE]
    const activeTranslations: Partial<Record<TranslationKey, string>> = active

    return {
      language,
      t: (key, values) => interpolate(activeTranslations[key] ?? fallback[key], values),
      formatNumber: (numberValue) => new Intl.NumberFormat(language).format(numberValue),
      formatDate: (dateValue, options) => {
        const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue
        if (Number.isNaN(date.getTime())) return active["app.unknown"]

        return new Intl.DateTimeFormat(language, options).format(date)
      },
    }
  }, [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error("useI18n must be used inside I18nProvider")

  return value
}

export type { LanguageCode, TranslationKey }
