import "server-only"
import { isJobName, jobs } from "./registry"
import type { JobContext, JobResult } from "./types"

export class UnknownJobError extends Error {
  constructor(readonly jobName: string) {
    super(`Unknown job: ${jobName}`)
    this.name = "UnknownJobError"
  }
}

export class InvalidJobPayloadError extends Error {
  constructor(
    readonly jobName: string,
    readonly issues: string,
  ) {
    super(`Invalid payload for job ${jobName}: ${issues}`)
    this.name = "InvalidJobPayloadError"
  }
}

/**
 * Runs a job by name. This is the one place job names and payloads are
 * validated: callers map {@link UnknownJobError} and
 * {@link InvalidJobPayloadError} to their own responses (404/400, retry or ack).
 *
 * Logs one line per run (name, trigger, duration, outcome) and rethrows
 * failures so the caller can report them or let the queue retry.
 */
export async function runJob(name: string, payload: unknown, ctx: JobContext): Promise<JobResult> {
  if (!isJobName(name)) throw new UnknownJobError(name)
  const job = jobs[name]

  let input = payload
  if (job.schema) {
    const parsed = job.schema.safeParse(payload)
    if (!parsed.success) {
      throw new InvalidJobPayloadError(name, parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "))
    }
    input = parsed.data
  }

  const started = performance.now()
  const where = { job: name, trigger: ctx.trigger, messageId: ctx.messageId, deliveryCount: ctx.deliveryCount }
  try {
    const result = (await job.run(input, ctx)) ?? {}
    console.info("[jobs] ok", { ...where, ms: Math.round(performance.now() - started) })
    return result
  } catch (err) {
    console.error("[jobs] failed", { ...where, ms: Math.round(performance.now() - started) }, err)
    throw err
  }
}
