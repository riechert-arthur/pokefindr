import "server-only"
import { createTranslator, hasLocale } from "next-intl"
import { eq } from "drizzle-orm"
import { merge, type Messages, type Tree } from "@/i18n/messages"
import { DEFAULT_LOCALE, LOCALE_COOKIE, routing, type Locale } from "@/i18n/routing"
import en from "@/i18n/generated/en.json"
import es from "@/i18n/generated/es.json"
import { getDb, type Database } from "@/server/db/client"
import { profiles } from "@/server/db/schema"

/** The page's language, passed from our API routes to Better Auth's email hooks. */
export const LOCALE_HEADER = "x-pokefindr-locale"

/** Every catalog, loaded once: emails and route handlers translate outside React. */
const MESSAGES: Record<Locale, Messages> = { en, es: merge(en, es as Tree) as Messages }

/** next-intl's translator for a language, for code that isn't a component (emails, route handlers). */
export function serverTranslator(locale: Locale) {
  return createTranslator({ locale, messages: MESSAGES[locale] })
}

/**
 * The language of the page a request came from (#185): the one our route
 * passed on, else the language prefix of its Referer (/es/signup), else the
 * language cookie, else English. API routes have no language of their own.
 */
export function requestLocale(req: Request): Locale {
  // Set by identityRequest (src/server/auth/identity.ts), which makes the request Better Auth sees.
  const forwarded = req.headers.get(LOCALE_HEADER)
  if (hasLocale(routing.locales, forwarded)) return forwarded
  const referer = req.headers.get("referer")
  if (referer) {
    try {
      const first = new URL(referer).pathname.split("/")[1]
      if (hasLocale(routing.locales, first)) return first
      return DEFAULT_LOCALE
    } catch {
      // Not a URL: try the cookie.
    }
  }
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`))?.[1]
  return hasLocale(routing.locales, cookie) ? cookie : DEFAULT_LOCALE
}

/** A user's language for an email: the one on their profile, else `fallback` (the request's, or English). */
export async function userLocale(userId: string, fallback: Locale = DEFAULT_LOCALE, db: Database = getDb()): Promise<Locale> {
  const [row] = await db.select({ locale: profiles.locale }).from(profiles).where(eq(profiles.id, userId))
  return hasLocale(routing.locales, row?.locale) ? row.locale : fallback
}
