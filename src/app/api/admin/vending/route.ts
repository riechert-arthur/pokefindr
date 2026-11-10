import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { MACHINE_ID, normalizeMachineId } from "@/lib/locations/address"
import { requireEntitlement } from "@/server/admin/access"
import { enqueueJob } from "@/server/lib/jobs/enqueue"
import { addVendingMachine } from "@/server/services/vending"
import { audit, log } from "@/server/log"

export const dynamic = "force-dynamic"

const text = (max: number) => z.string().trim().min(1).max(max)
const body = z.object({
  retailer: text(80),
  machineId: z.string().transform(normalizeMachineId).refine((v) => MACHINE_ID.test(v), "A machine ID is Q and five digits, like Q00245"),
  address: text(200),
  city: text(80),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/, "Use the state's two letters"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

/**
 * POST /api/admin/vending  { retailer, machineId, address, city, state, lat, lng }
 *   Adds a vending machine missing from the official list (#155). 201 { id };
 *   409 { overlaps } when it overlaps an existing machine (no override);
 *   400 for a bad field or a pin outside the state. Admins only.
 */
export async function POST(request: NextRequest) {
  const staff = await requireEntitlement(request, "admin.vending")
  if (staff instanceof NextResponse) return staff
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: issue.message, field: issue.path[0] ?? null }, { status: 400 })
  }
  try {
    const result = await addVendingMachine(parsed.data, staff.userId)
    audit(log.forRequest(request, "/api/admin/vending"), "vending.add", { actorId: staff.userId, target: result.status === "added" ? result.id : undefined, outcome: result.status })
    if (result.status === "overlap") return NextResponse.json({ error: "This overlaps a machine already on the map.", overlaps: result.overlaps }, { status: 409 })
    if (result.status === "wrong_state")
      return NextResponse.json({ error: result.pinState ? `The pin is in ${result.pinState}, not ${parsed.data.state.toUpperCase()}.` : "The pin isn't in a US state.", field: "pin" }, { status: 400 })
    // The state and region counts are a materialized view: refresh it so the new machine counts.
    await enqueueJob("refresh-region-counts", {}).catch((err) => log.forRequest(request, "/api/admin/vending").logError("api.failed", err, { step: "couldn't queue the counts refresh" }))
    return NextResponse.json({ id: result.id }, { status: 201 })
  } catch (err) {
    log.forRequest(request, "/api/admin/vending").logError("api.failed", err, { step: "failed to add" })
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
