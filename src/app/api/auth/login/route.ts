import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { VERIFIED_CALLBACK, localizedCallback } from "@/lib/auth/paths"
import { requestLocale } from "@/server/i18n"
import { identityCookies, identityRequest, refuseCrossSite } from "@/server/auth/identity"
import { profileLocale, profileLocaleCookie } from "@/server/auth/locale-cookie"
import { createSessionCookie } from "@/server/auth/session"
import { getProfile, getSessionTier } from "@/server/services/users"
import { apiError } from "@/server/api-error"

const body = z.object({ email: z.string().min(1).max(320), password: z.string().min(1).max(256) })

const loginFailed = () =>
  apiError("wrongPassword", "Wrong email or password. If you haven't confirmed your email yet, we've sent you a new link.", 401)

/**
 * Email and password login, checked by Better Auth (with its rate limit).
 * Signs the app's own `app_session` cookie, which middleware reads, and
 * passes on Better Auth's session cookie, which logout revokes.
 */
export async function POST(req: NextRequest) {
  const refused = refuseCrossSite(req)
  if (refused) return refused
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiError("credentialsMissing", "Enter your email and password", 400)

  const res = await identityRequest(req, "/sign-in/email", { ...parsed.data, callbackURL: localizedCallback(VERIFIED_CALLBACK, requestLocale(req)) })
  if (res.status === 429) return apiError("tooManyAttempts", "Too many attempts. Wait a minute and try again.", 429)
  // An unconfirmed email gets the same answer as a wrong password (Better Auth sends it a new
  // link): sign up with any email and a password you pick, and a different answer here would
  // show whether that email already had an account.
  if (!res.ok) return loginFailed()

  const { user } = (await res.json()) as { user: { id: string; email: string } }
  const [profile, tier] = await Promise.all([getProfile(user.id), getSessionTier(user.id)])
  if (!profile) return loginFailed()

  // The language they picked on another device (#182): the form opens the next page in it.
  const response = NextResponse.json({ ok: true, locale: profileLocale(profile.locale) })
  for (const cookie of identityCookies(res)) response.headers.append("Set-Cookie", cookie)
  response.headers.append("Set-Cookie", createSessionCookie({ sub: user.id, email: user.email, tier }))
  const locale = profileLocaleCookie(profile.locale)
  if (locale) response.headers.append("Set-Cookie", locale)
  return response
}
