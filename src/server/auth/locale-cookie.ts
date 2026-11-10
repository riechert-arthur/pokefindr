import "server-only"
import { serialize } from "cookie"
import { hasLocale } from "next-intl"
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, PUBLIC_LOCALES, type Locale } from "@/i18n/routing"

/**
 * The language cookie for someone signing in, from the language saved on
 * their profile (#182), so it follows them to a new device. Null when they
 * haven't picked one, or picked a language that isn't public: the browser's
 * own choice stands.
 */
export function profileLocaleCookie(locale: string | null | undefined): string | null {
  const picked = profileLocale(locale)
  return picked && serialize(LOCALE_COOKIE, picked, { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" })
}

/** The profile's language if it's one visitors can use, for the page after login to open in. */
export function profileLocale(locale: string | null | undefined): Locale | null {
  return hasLocale(PUBLIC_LOCALES, locale) ? locale : null
}

/** Clears the language cookie at logout, so a shared device goes back to its browser's language. */
export const clearedLocaleCookie = (): string => serialize(LOCALE_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax" })
