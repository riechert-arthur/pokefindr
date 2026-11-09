import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { requireStaff } from "@/server/admin/access"
import { enqueueJob } from "@/server/lib/jobs/enqueue"
import { undoVendingMachine } from "@/server/services/vending"

export const dynamic = "force-dynamic"

/** DELETE /api/admin/vending/:id: undoes adding a machine by hand (#155), a soft delete. Admins only. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request, "admin")
  if (staff instanceof NextResponse) return staff
  const id = z.string().uuid().safeParse((await context.params).id)
  if (!id.success) return NextResponse.json({ error: "Machine not found" }, { status: 404 })
  try {
    if (!(await undoVendingMachine(id.data, staff.userId))) return NextResponse.json({ error: "Only a machine added here, still on the map, can be undone." }, { status: 404 })
    await enqueueJob("refresh-region-counts", {}).catch((err) => console.error("[api/admin/vending] couldn't queue the counts refresh", err))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/admin/vending] failed to undo", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
