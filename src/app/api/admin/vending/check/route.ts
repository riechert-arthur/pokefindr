import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { requireEntitlement } from "@/server/admin/access"
import { checkVendingOverlap } from "@/server/services/vending"

export const dynamic = "force-dynamic"

const body = z.object({
  machineId: z.string().trim().max(20),
  address: z.string().trim().max(200),
  state: z.string().trim().max(4),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

/**
 * POST /api/admin/vending/check  { machineId, address, state, lat, lng }
 *   The machines a new one would duplicate, with why (#154): { overlaps }.
 *   For the Add vending machine form's live check. Admins only.
 */
export async function POST(request: NextRequest) {
  const staff = await requireEntitlement(request, "admin.vending")
  if (staff instanceof NextResponse) return staff
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Send machineId, address, state, lat and lng" }, { status: 400 })
  try {
    return NextResponse.json({ overlaps: await checkVendingOverlap(parsed.data) })
  } catch (err) {
    console.error("[api/admin/vending/check] failed", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
