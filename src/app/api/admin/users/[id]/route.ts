import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { requireEntitlement } from "@/server/admin/access"
import { setRole } from "@/server/services/user-admin"
import { SET_ROLE_ERRORS, type SetRoleRefusal } from "@/lib/admin/users"

export const dynamic = "force-dynamic"

const body = z.object({ role: z.string().max(40) })
const uuid = z.string().uuid()

const STATUS: Record<SetRoleRefusal, number> = { own: 409, not_found: 404, invalid_role: 400, last_super_admin: 409, forbidden: 404 }

/**
 * PATCH /api/admin/users/:id  { role }  Sets someone's role to member,
 * moderator or admin, and records it in role_changes (#294). Not your own,
 * and not the last super admin's. Super admins only (`users.manage`);
 * everyone else gets a 404. The new role applies on that person's next
 * request, since roles are read from profiles each time.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireEntitlement(request, "users.manage")
  if (staff instanceof NextResponse) return staff
  const { id } = await context.params
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: SET_ROLE_ERRORS.not_found }, { status: 404 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: SET_ROLE_ERRORS.invalid_role }, { status: 400 })
  try {
    const result = await setRole(staff.userId, id, parsed.data.role)
    if (result.status === "done" || result.status === "unchanged") return NextResponse.json(result)
    return NextResponse.json({ error: SET_ROLE_ERRORS[result.status], status: result.status }, { status: STATUS[result.status] })
  } catch (err) {
    console.error("[api/admin/users] failed", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
