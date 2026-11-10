import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { requireEntitlement } from "@/server/admin/access"
import { enqueueJob } from "@/server/lib/jobs/enqueue"
import { undoVendingMachine } from "@/server/services/vending"
import { audit, log } from "@/server/log"

export const dynamic = "force-dynamic"

/** DELETE /api/admin/vending/:id: undoes adding a machine by hand (#155), deleting the row. Admins only. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireEntitlement(request, "admin.vending")
  if (staff instanceof NextResponse) return staff
  const logger = log.forRequest(request, "/api/admin/vending/[id]")
  const id = z.string().uuid().safeParse((await context.params).id)
  if (!id.success) return NextResponse.json({ error: "Machine not found" }, { status: 404 })
  try {
    const undone = await undoVendingMachine(id.data)
    audit(logger, "vending.undo", { actorId: staff.userId, target: id.data, outcome: undone ? "done" : "not_found" })
    if (!undone) return NextResponse.json({ error: "Only a machine added here can be undone." }, { status: 404 })
    await enqueueJob("refresh-region-counts", {}).catch((err) => logger.logError("api.failed", err, { step: "couldn't queue the counts refresh" }))
    return NextResponse.json({ ok: true })
  } catch (err) {
    // Who tried what, even when it failed.
    audit(logger, "vending.undo", { actorId: staff.userId, target: id.data, outcome: "error" })
    logger.logError("api.failed", err, { step: "failed to undo" })
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
