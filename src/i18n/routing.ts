import { defineRouting } from "next-intl/routing"

/**
 * Every language with its own URLs (docs/i18n.md). English, the default, has no
 * prefix (`/map`); the others do (`/es/map`).
 */
export const LOCALES = ["en", "es"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"

/**
 * The languages that are ready for visitors: detected from the browser, offered
 * in the switcher, in the sitemap and indexed. Spanish joins in #186.
 */
export const PUBLIC_LOCALES: readonly Locale[] = ["en"]

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
  // Reading the cookie and Accept-Language would send visitors to a language
  // that isn't public yet.
  localeDetection: PUBLIC_LOCALES.length > 1,
  // The saved choice comes with the switcher (#182).
  localeCookie: false,
  // hreflang goes in each page's metadata, for public languages only (#183).
  alternateLinks: false,
})
