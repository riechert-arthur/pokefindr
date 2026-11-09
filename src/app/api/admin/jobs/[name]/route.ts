import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { requireStaff } from "@/server/admin/access"
import { enqueueJob } from "@/server/lib/jobs/enqueue"
import { pausedReason } from "@/server/lib/jobs/history"
import { isJobName } from "@/server/lib/jobs/registry"
import { jobCatalog, pauseJob, resumeJob } from "@/server/services/admin-jobs"

export const dynamic = "force-dynamic"

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run") }),
  z.object({ action: z.literal("pause"), reason: z.string().trim().min(1).max(200).default("Paused by an admin") }),
  z.object({ action: z.literal("resume") }),
])

/**
 * POST /api/admin/jobs/:name  { action: run | pause | resume, reason? }
 *   Run now enqueues the job (enqueueJob); a paused job, one that needs a
 *   payload, or one that isn't a job can't be run. Pause and resume set the
 *   pause flag. Admins only.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  const staff = await requireStaff(request, "admin")
  if (staff instanceof NextResponse) return staff
  const { name } = await context.params
  const info = jobCatalog().find((j) => j.name === name)
  if (!info || !isJobName(name)) return NextResponse.json({ error: "That job can't be changed here" }, { status: 404 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "action must be run, pause or resume" }, { status: 400 })
  try {
    const b = parsed.data
    if (b.action === "pause") await pauseJob(name, b.reason, staff.userId)
    else if (b.action === "resume") await resumeJob(name)
    else {
      if (!info.runnable) return NextResponse.json({ error: "This job runs on its own, per item. It can't be run by hand." }, { status: 409 })
      const paused = await pausedReason(name)
      if (paused) return NextResponse.json({ error: `It's paused: ${paused}. Resume it first.` }, { status: 409 })
      await enqueueJob(name, null)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/admin/jobs] failed", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
