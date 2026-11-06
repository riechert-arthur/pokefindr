import { NextResponse, type NextRequest } from "next/server"
import { getServerConfig } from "@/server/config"
import { isAuthorizedJobRequest } from "@/server/lib/jobs/auth"
import { InvalidJobPayloadError, runJob, UnknownJobError } from "@/server/lib/jobs/run"
import type { JobTrigger } from "@/server/lib/jobs/types"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ name: string }> }

/**
 * Runs one job now. Vercel Cron calls this with GET and
 * `Authorization: Bearer <CRON_SECRET>`; anything else that schedules jobs
 * (GitHub Actions, another host's cron) can use POST with the same header.
 * A POST may send a JSON body as the job's payload.
 */
async function handle(req: NextRequest, { params }: Params, payload: unknown, trigger: JobTrigger) {
  if (!isAuthorizedJobRequest(req.headers.get("authorization"), getServerConfig().CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { name } = await params
  try {
    const result = await runJob(name, payload, { trigger })
    return NextResponse.json({ job: name, ok: true, result })
  } catch (err) {
    if (err instanceof UnknownJobError) return NextResponse.json({ error: "Unknown job" }, { status: 404 })
    if (err instanceof InvalidJobPayloadError) return NextResponse.json({ error: "Invalid payload", issues: err.issues }, { status: 400 })
    // runJob already logged the error; don't echo internals to the caller.
    return NextResponse.json({ job: name, ok: false, error: "Job failed" }, { status: 500 })
  }
}

/** Vercel Cron identifies itself with `user-agent: vercel-cron/1.0`; other GETs are logged as plain HTTP. */
export async function GET(req: NextRequest, ctx: Params) {
  const fromVercelCron = req.headers.get("user-agent")?.startsWith("vercel-cron/") ?? false
  return handle(req, ctx, null, fromVercelCron ? "cron" : "http")
}

export async function POST(req: NextRequest, ctx: Params) {
  const text = await req.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
    }
  }
  return handle(req, ctx, payload, "http")
}
