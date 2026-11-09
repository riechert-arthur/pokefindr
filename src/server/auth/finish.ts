import "server-only"
import { NextResponse } from "next/server"
import { getAuth } from "@/server/auth/auth"
import { createSessionCookie } from "@/server/auth/session"
import { getSessionTier } from "@/server/services/users"

/** The Better Auth session the browser holds after OAuth (its cookie), or null. */
export async function identitySession(headers: Headers) {
  return getAuth().api.getSession({ headers }).catch(() => null)
}

/** Signs the app's `app_session` cookie for a user who's done signing in. */
export async function signedIn(user: { id: string; email: string }): Promise<NextResponse> {
  return NextResponse.json(
    { ok: true },
    { headers: { "Set-Cookie": createSessionCookie({ sub: user.id, email: user.email, tier: await getSessionTier(user.id) }) } },
  )
}
