import "server-only"
import { serialize } from "cookie"
import { hasLocale } from "next-intl"
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, routing } from "@/i18n/routing"

/**
 * The language cookie for someone signing in, from the language saved on
 * their profile (#182), so it follows them to a new device. Null when they
 * haven't picked one: the browser's own choice stands.
 */
export function profileLocaleCookie(locale: string | null | undefined): string | null {
  if (!hasLocale(routing.locales, locale)) return null
  return serialize(LOCALE_COOKIE, locale, { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" })
}
