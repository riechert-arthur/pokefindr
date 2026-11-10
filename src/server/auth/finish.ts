import "server-only"
import { NextResponse } from "next/server"
import { getAuth } from "@/server/auth/auth"
import { createSessionCookie } from "@/server/auth/session"
import { profileLocale, profileLocaleCookie } from "@/server/auth/locale-cookie"
import { getProfile, getSessionTier } from "@/server/services/users"

/** The Better Auth session the browser holds after OAuth (its cookie), or null. */
export async function identitySession(headers: Headers) {
  return getAuth().api.getSession({ headers }).catch(() => null)
}

/**
 * Signs the app's `app_session` cookie for a user who's done signing in, and
 * sets the language they picked on their profile (#182). The response names
 * it too, so the page that called opens the next one in that language.
 */
export async function signedIn(user: { id: string; email: string }): Promise<NextResponse> {
  const [tier, profile] = await Promise.all([getSessionTier(user.id), getProfile(user.id)])
  const response = NextResponse.json({ ok: true, locale: profileLocale(profile?.locale) })
  response.headers.append("Set-Cookie", createSessionCookie({ sub: user.id, email: user.email, tier }))
  const locale = profileLocaleCookie(profile?.locale)
  if (locale) response.headers.append("Set-Cookie", locale)
  return response
}
