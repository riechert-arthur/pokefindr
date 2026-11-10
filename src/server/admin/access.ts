import "server-only"
import { NextResponse } from "next/server"
import { can, type Entitlement } from "@/lib/auth/entitlements"
import type { Role } from "@/lib/auth/roles"
import { getRole } from "@/server/services/moderation"

/** The user's role, or null for no user or no profile. */
export async function roleOf(userId: string | null | undefined): Promise<Role | null> {
  return userId ? getRole(userId) : null
}

/**
 * Guards an /api/admin route: the signed-in user (middleware sets
 * x-user-id) with entitlement `e` (src/lib/auth/entitlements.ts). Returns
 * them, or the response to send: 401 without a session, 404 for anyone else,
 * so the route's existence isn't shown.
 */
export async function requireEntitlement(request: Request, e: Entitlement): Promise<{ userId: string; role: Role } | NextResponse> {
  const userId = request.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Log in to continue" }, { status: 401 })
  const role = await roleOf(userId)
  if (!role || !can(role, e)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return { userId, role }
}
