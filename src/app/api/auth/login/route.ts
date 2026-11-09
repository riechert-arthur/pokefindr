import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { identityCookies, identityRequest } from "@/server/auth/identity"
import { createSessionCookie } from "@/server/auth/session"
import { getProfile, getSessionTier } from "@/server/services/users"

const body = z.object({ email: z.string().min(1).max(320), password: z.string().min(1).max(256) })

/**
 * Email and password login, checked by Better Auth (with its rate limit).
 * Signs the app's own `app_session` cookie, which middleware reads, and
 * passes on Better Auth's session cookie, which logout revokes.
 */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Enter your email and password" }, { status: 400 })

  const res = await identityRequest(req, "/sign-in/email", parsed.data)
  if (res.status === 429) return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 })
  if (res.status === 403) {
    // Better Auth sends a fresh confirmation link on this attempt.
    return NextResponse.json({ error: "Confirm your email first. We've sent you a new link.", code: "EMAIL_NOT_VERIFIED" }, { status: 401 })
  }
  if (!res.ok) return NextResponse.json({ error: "Wrong email or password" }, { status: 401 })

  const { user } = (await res.json()) as { user: { id: string; email: string } }
  if (!(await getProfile(user.id))) return NextResponse.json({ error: "Wrong email or password" }, { status: 401 })

  const response = NextResponse.json({ ok: true })
  for (const cookie of identityCookies(res)) response.headers.append("Set-Cookie", cookie)
  response.headers.append("Set-Cookie", createSessionCookie({ sub: user.id, email: user.email, tier: await getSessionTier(user.id) }))
  return response
}
