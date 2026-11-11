import { NextResponse, type NextRequest } from "next/server"
import { identityCookies, identityRequest, refuseCrossSite } from "@/server/auth/identity"
import { clearedLocaleCookie } from "@/server/auth/locale-cookie"
import { clearSessionCookie } from "@/server/auth/session"
import { log } from "@/server/log"

/**
 * Signs out: revokes the Better Auth session and clears both cookies, and the
 * language cookie login set from the profile (#182), so a shared device goes
 * back to its browser's language.
 */
export async function POST(req: NextRequest) {
  const refused = refuseCrossSite(req)
  if (refused) return refused
  const response = NextResponse.json({ ok: true })
  try {
    const res = await identityRequest(req, "/sign-out")
    for (const cookie of identityCookies(res)) response.headers.append("Set-Cookie", cookie)
  } catch (err) {
    // Still sign out of the app: the Better Auth session expires on its own.
    log.forRequest(req, "/api/auth/logout").logError("api.failed", err, { step: "couldn't revoke the session" })
  }
  response.headers.append("Set-Cookie", clearSessionCookie())
  response.headers.append("Set-Cookie", clearedLocaleCookie())
  return response
}
