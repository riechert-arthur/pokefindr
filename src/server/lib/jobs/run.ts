import "server-only"
import { isJobName, jobs } from "./registry"
import type { JobContext, JobResult } from "./types"

export class UnknownJobError extends Error {
  constructor(readonly jobName: string) {
    super(`Unknown job: ${jobName}`)
    this.name = "UnknownJobError"
  }
}

/**
 * Runs a job by name and logs one line per run: name, trigger, duration and
 * outcome. Rethrows failures so the caller (cron route, queue consumer, CLI)
 * can report them or let the queue retry.
 */
export async function runJob(name: string, payload: unknown, ctx: JobContext): Promise<JobResult> {
  if (!isJobName(name)) throw new UnknownJobError(name)

  const started = performance.now()
  const where = { job: name, trigger: ctx.trigger, messageId: ctx.messageId, deliveryCount: ctx.deliveryCount }
  try {
    const result = (await jobs[name].run(payload, ctx)) ?? {}
    console.info("[jobs] ok", { ...where, ms: Math.round(performance.now() - started) })
    return result
  } catch (err) {
    console.error("[jobs] failed", { ...where, ms: Math.round(performance.now() - started) }, err)
    throw err
  }
}
