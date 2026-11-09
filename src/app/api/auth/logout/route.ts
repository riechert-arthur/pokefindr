import { NextResponse, type NextRequest } from "next/server"
import { identityCookies, identityRequest } from "@/server/auth/identity"
import { clearSessionCookie } from "@/server/auth/session"

/** Signs out: revokes the Better Auth session and clears both cookies. */
export async function POST(req: NextRequest) {
  const response = NextResponse.json({ ok: true })
  try {
    const res = await identityRequest(req, "/sign-out")
    for (const cookie of identityCookies(res)) response.headers.append("Set-Cookie", cookie)
  } catch (err) {
    // Still sign out of the app: the Better Auth session expires on its own.
    console.error("[auth] couldn't revoke the session", err)
  }
  response.headers.append("Set-Cookie", clearSessionCookie())
  return response
}
