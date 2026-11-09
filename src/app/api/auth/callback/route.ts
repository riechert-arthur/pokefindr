import { NextResponse, type NextRequest } from "next/server"
import { identitySession, signedIn } from "@/server/auth/finish"
import { getProfile } from "@/server/services/users"

/**
 * After OAuth: Better Auth has set its session cookie. An existing user is
 * signed in (200, with app_session). A new one needs a username first: 204,
 * and the page asks for one (POST /api/auth/onboarding).
 */
export async function POST(req: NextRequest) {
  const session = await identitySession(req.headers)
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  if (!(await getProfile(session.user.id))) return new NextResponse(null, { status: 204 })
  return signedIn(session.user)
}
