import { NextResponse, type NextRequest } from "next/server"
import { requireEntitlement } from "@/server/admin/access"
import { listUsers } from "@/server/services/user-admin"
import { ROLES, type Role } from "@/lib/auth/roles"
import { log } from "@/server/log"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/users?q=&role=&cursor=  Admin → Users (#294): a page of
 * users with their email and role. Super admins only (`users.manage`);
 * everyone else gets a 404.
 */
export async function GET(request: NextRequest) {
  const staff = await requireEntitlement(request, "users.manage")
  if (staff instanceof NextResponse) return staff
  const params = request.nextUrl.searchParams
  const role = params.get("role") || null
  if (role && !(ROLES as readonly string[]).includes(role)) return NextResponse.json({ error: `role must be one of ${ROLES.join(", ")}` }, { status: 400 })
  const q = params.get("q")?.slice(0, 100) ?? null
  try {
    return NextResponse.json(await listUsers({ q, role: role as Role | null, cursor: params.get("cursor") }), { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    log.forRequest(request, "/api/admin/users").logError("admin.users_failed", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
