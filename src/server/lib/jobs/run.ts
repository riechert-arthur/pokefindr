import "server-only"
import { isJobName, jobs } from "./registry"
import { finishRun, pausedReason, recordSkipped, startRun } from "./history"
import type { JobContext, JobResult } from "./types"
import { log } from "@/server/log"

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
 * A queue message for a paused job (#157). The consumer puts it back on the
 * queue for later instead of dropping it, so per-item jobs (emails) wait out
 * the pause rather than lose their messages.
 */
export class JobPausedError extends Error {
  constructor(
    readonly jobName: string,
    readonly reason: string,
  ) {
    super(`Job ${jobName} is paused: ${reason}`)
    this.name = "JobPausedError"
  }
}

/**
 * Runs a job by name. This is the one place job names and payloads are
 * validated: callers map {@link UnknownJobError} and
 * {@link InvalidJobPayloadError} to their own responses (404/400, retry or ack).
 *
 * Logs one line per run (name, trigger, duration, outcome and counts), records it in
 * job_runs for the admin's Jobs page (#157), and rethrows failures so the
 * caller can report them or let the queue retry. A paused job is recorded
 * as skipped instead (except from the CLI); from the queue it throws
 * {@link JobPausedError} so the message is kept.
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

  const where = { job: name, trigger: ctx.trigger, messageId: ctx.messageId, deliveryCount: ctx.deliveryCount }
  // A paused job (#157) doesn't run from cron or the queue; the CLI still runs it, on purpose.
  if (ctx.trigger !== "cli") {
    const paused = await pausedReason(name)
    if (paused) {
      if (ctx.trigger === "queue") throw new JobPausedError(name, paused)
      log.info("job.skipped", { ...where, reason: paused })
      await recordSkipped(name, ctx.trigger, paused)
      return { skipped: true, paused }
    }
  }

  const started = performance.now()
  const runId = await startRun(name, ctx.trigger)
  try {
    const result = (await job.run(input, ctx)) ?? {}
    // `result` is the job's counts: the rows it touched.
    log.info("job.ok", { ...where, ms: Math.round(performance.now() - started), result })
    await finishRun(runId, "succeeded", { result })
    return result
  } catch (err) {
    log.logError("job.failed", err, { ...where, ms: Math.round(performance.now() - started) })
    await finishRun(runId, "failed", { error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}
