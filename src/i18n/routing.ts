import { defineRouting } from "next-intl/routing"

/**
 * Every language with its own URLs (docs/i18n.md). English, the default, has no
 * prefix (`/map`); the others do (`/es/map`).
 */
export const LOCALES = ["en", "es"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"

/** The cookie that keeps the language someone picked (#182). Signing in sets it from their profile. */
export const LOCALE_COOKIE = "NEXT_LOCALE"
/** A year, like the session's own "remember me". */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * The languages that are ready for visitors: detected from the browser, offered
 * in the switcher, in the sitemap and indexed. Spanish since #186. A new
 * language is in LOCALES first, and here once it's reviewed (docs/i18n.md).
 */
export const PUBLIC_LOCALES: readonly Locale[] = ["en", "es"]

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
  // Off while English is the only public language: reading the cookie and
  // Accept-Language would send visitors to a language that isn't ready.
  localeDetection: PUBLIC_LOCALES.length > 1,
  // Kept when someone visits or switches to another language (#182), once
  // languages are detected. Before that it isn't written either: it would
  // save English for a year for browsers that ask for another language.
  localeCookie: PUBLIC_LOCALES.length > 1 ? { name: LOCALE_COOKIE, maxAge: LOCALE_COOKIE_MAX_AGE } : false,
  // hreflang goes in each page's metadata, for public languages only (#183).
  alternateLinks: false,
})
