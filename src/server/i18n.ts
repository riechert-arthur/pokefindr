import "server-only"
import { createTranslator, hasLocale } from "next-intl"
import { eq } from "drizzle-orm"
import { MESSAGES } from "@/i18n/all-messages"
import type { Messages } from "@/i18n/messages"
import { DEFAULT_LOCALE, LOCALE_COOKIE, PUBLIC_LOCALES, routing, type Locale } from "@/i18n/routing"
import { getDb, type Database } from "@/server/db/client"
import { profiles } from "@/server/db/schema"

/** The page's language, passed from our API routes to Better Auth's email hooks. */
export const LOCALE_HEADER = "x-pokefindr-locale"

const translators = new Map<Locale, ReturnType<typeof createTranslator<Messages>>>()

/**
 * next-intl's translator for a language, for code that isn't a component
 * (emails, route handlers). One per language, so its message cache is shared.
 */
export function serverTranslator(locale: Locale) {
  let t = translators.get(locale)
  if (!t) translators.set(locale, (t = createTranslator({ locale, messages: MESSAGES[locale] })))
  return t
}

/** A stored or sent language as a Locale, else `fallback`. */
export const toLocale = (value: string | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale => (hasLocale(routing.locales, value) ? value : fallback)

/**
 * The language a request shows the visitor picked or is reading (#185): the
 * one our route passed on, else the language prefix of its Referer
 * (/es/signup), else the language cookie. Null when none says: an unprefixed
 * page (an English one, or the OAuth callback) doesn't count, so the cookie
 * can still answer.
 */
export function pickedLocale(req: Request): Locale | null {
  // Set by identityRequest (src/server/auth/identity.ts), which makes the request Better Auth sees.
  const forwarded = req.headers.get(LOCALE_HEADER)
  if (hasLocale(routing.locales, forwarded)) return forwarded
  const referer = req.headers.get("referer")
  if (referer) {
    try {
      const first = new URL(referer).pathname.split("/")[1]
      if (hasLocale(routing.locales, first)) return first
    } catch {
      // Not a URL: try the cookie.
    }
  }
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`))?.[1]
  return hasLocale(routing.locales, cookie) ? cookie : null
}

/** The language for a request's emails and messages: the one it shows, else English. API routes have no language of their own. */
export const requestLocale = (req: Request): Locale => pickedLocale(req) ?? DEFAULT_LOCALE

/**
 * The language to save on a new profile (#182): one the visitor picked and
 * that's public, else none, so null keeps meaning "hasn't picked one" and the
 * browser's own choice stands on their other devices.
 */
export function signupLocale(req: Request): Locale | null {
  const picked = pickedLocale(req)
  return picked && picked !== DEFAULT_LOCALE && hasLocale(PUBLIC_LOCALES, picked) ? picked : null
}

/** A user's language for an email: the one on their profile, else `fallback` (the request's, or English). */
export async function userLocale(userId: string, fallback: Locale = DEFAULT_LOCALE, db: Database = getDb()): Promise<Locale> {
  const [row] = await db.select({ locale: profiles.locale }).from(profiles).where(eq(profiles.id, userId))
  return toLocale(row?.locale, fallback)
}
