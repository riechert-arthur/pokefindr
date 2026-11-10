import { NextResponse } from "next/server"
import { authHandler, IDENTITY_BASE_PATH } from "@/server/auth/auth"

/**
 * Better Auth's endpoints the browser uses directly: OAuth, email links,
 * password reset. Sign-up, login and changing the email go through our
 * routes instead (/api/auth/*, /api/user-settings), which add the profile
 * and our checks, so they aren't reachable here. A sign-up made here would
 * have no profile, and would hold its email so its owner couldn't sign up.
 */
const OURS_INSTEAD = new Set(["/sign-up/email", "/sign-in/email", "/change-email"])

function handle(req: Request) {
  const path = new URL(req.url).pathname.slice(IDENTITY_BASE_PATH.length).replace(/\/+$/, "")
  if (OURS_INSTEAD.has(path)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return authHandler(req)
}

export const GET = handle
export const POST = handle
