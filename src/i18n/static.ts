import { setRequestLocale } from "next-intl/server"
import type { Locale } from "./routing"

/** The props Next passes a page or layout under [locale]. */
export type LocaleParams = { params: Promise<{ locale: string }> }

/**
 * Tells next-intl the page's language from its URL, so it doesn't read the
 * request headers and the page can still be built ahead of time. Next renders
 * layouts and pages separately, so each static one calls this (next-intl's
 * static rendering guide). [locale]/layout.tsx has already checked the locale.
 */
export async function setPageLocale(params: LocaleParams["params"]): Promise<Locale> {
  const locale = (await params).locale as Locale
  setRequestLocale(locale)
  return locale
}
