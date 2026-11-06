import { NextResponse, type NextRequest } from "next/server"
import { getServerConfig } from "@/server/config"
import { isAuthorizedJobRequest } from "@/server/lib/jobs/auth"
import { isJobName } from "@/server/lib/jobs/registry"
import { runJob } from "@/server/lib/jobs/run"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ name: string }> }

/**
 * Runs one job now. Vercel Cron calls this with GET and
 * `Authorization: Bearer <CRON_SECRET>`; anything else that schedules jobs
 * (GitHub Actions, another host's cron) can use POST with the same header.
 * A POST may send a JSON body as the job's payload.
 */
async function handle(req: NextRequest, { params }: Params, payload: unknown) {
  if (!isAuthorizedJobRequest(req.headers.get("authorization"), getServerConfig().CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { name } = await params
  if (!isJobName(name)) {
    return NextResponse.json({ error: "Unknown job" }, { status: 404 })
  }

  try {
    const result = await runJob(name, payload, { trigger: "cron" })
    return NextResponse.json({ job: name, ok: true, result })
  } catch {
    // runJob already logged the error; don't echo internals to the caller.
    return NextResponse.json({ job: name, ok: false, error: "Job failed" }, { status: 500 })
  }
}

export async function GET(req: NextRequest, ctx: Params) {
  return handle(req, ctx, null)
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
  return handle(req, ctx, payload)
}
