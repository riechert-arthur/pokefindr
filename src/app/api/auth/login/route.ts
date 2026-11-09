import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { VERIFIED_CALLBACK } from "@/lib/auth/paths"
import { identityCookies, identityRequest, refuseCrossSite } from "@/server/auth/identity"
import { createSessionCookie } from "@/server/auth/session"
import { getProfile, getSessionTier } from "@/server/services/users"

const body = z.object({ email: z.string().min(1).max(320), password: z.string().min(1).max(256) })

const loginFailed = () =>
  NextResponse.json({ error: "Wrong email or password. If you haven't confirmed your email yet, we've sent you a new link." }, { status: 401 })

/**
 * Email and password login, checked by Better Auth (with its rate limit).
 * Signs the app's own `app_session` cookie, which middleware reads, and
 * passes on Better Auth's session cookie, which logout revokes.
 */
export async function POST(req: NextRequest) {
  const refused = refuseCrossSite(req)
  if (refused) return refused
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Enter your email and password" }, { status: 400 })

  const res = await identityRequest(req, "/sign-in/email", { ...parsed.data, callbackURL: VERIFIED_CALLBACK })
  if (res.status === 429) return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 })
  // An unconfirmed email gets the same answer as a wrong password (Better Auth sends it a new
  // link): sign up with any email and a password you pick, and a different answer here would
  // show whether that email already had an account.
  if (!res.ok) return loginFailed()

  const { user } = (await res.json()) as { user: { id: string; email: string } }
  if (!(await getProfile(user.id))) return loginFailed()

  const response = NextResponse.json({ ok: true })
  for (const cookie of identityCookies(res)) response.headers.append("Set-Cookie", cookie)
  response.headers.append("Set-Cookie", createSessionCookie({ sub: user.id, email: user.email, tier: await getSessionTier(user.id) }))
  return response
}
