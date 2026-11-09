import "server-only"
import { NextResponse } from "next/server"
import { getRole } from "@/server/services/moderation"

/**
 * Who may use the admin (#152): moderators (the Moderation group) and
 * admins (everything). The `profiles.role` column stands in until
 * entitlements (#70) replace it.
 */
export type { StaffRole } from "@/lib/admin/roles"
import type { StaffRole } from "@/lib/admin/roles"

/** The user's staff role, or null for everyone else (and for no user). */
export async function staffRole(userId: string | null | undefined): Promise<StaffRole | null> {
  if (!userId) return null
  const role = await getRole(userId)
  return role === "admin" || role === "moderator" ? role : null
}

/**
 * Guards an /api/admin route: the signed-in user (middleware sets
 * x-user-id) with at least `minimum`. Returns them, or the response to send
 * (401 without a session, 404 for anyone else, so the route's existence
 * isn't shown).
 */
export async function requireStaff(request: Request, minimum: StaffRole): Promise<{ userId: string; role: StaffRole } | NextResponse> {
  const userId = request.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Log in to continue" }, { status: 401 })
  const role = await staffRole(userId)
  if (!role || (minimum === "admin" && role !== "admin")) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return { userId, role }
}
