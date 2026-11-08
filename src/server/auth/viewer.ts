import "server-only"
import { jwtVerify } from "jose"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE_NAME } from "@/server/auth/cookie"
import { getJwtSecret } from "@/server/edge-config"

/**
 * The signed-in viewer's user id on a public route, or null. Middleware
 * guards private routes; a public one (a location's reviews) reads the
 * session itself to mark what's the viewer's own, and treats a missing or
 * bad token as signed out.
 */
export async function viewerId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(getJwtSecret()))
    return typeof payload.sub === "string" ? payload.sub : null
  } catch {
    return null
  }
}
