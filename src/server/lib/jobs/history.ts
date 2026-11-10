import "server-only"
import { eq } from "drizzle-orm"
import { getDb } from "@/server/db/client"
import { jobPauses, jobRuns, type JobRunStatus } from "@/server/db/schema"
import { log } from "@/server/log"

/**
 * Job run history and pauses (#157), for the admin's Jobs page. Recording
 * never fails a job: a database problem here is logged and the job runs
 * (or its result stands) all the same.
 */

/** Why the job is paused, or null when it isn't. */
export async function pausedReason(job: string): Promise<string | null> {
  try {
    const [row] = await getDb().select({ reason: jobPauses.reason }).from(jobPauses).where(eq(jobPauses.job, job))
    return row?.reason ?? null
  } catch (err) {
    log.logError("job.pause_check_failed", err, { job }, "warn")
    return null
  }
}

/** Records a run starting; its id, to finish it, or null if it couldn't be recorded. */
export async function startRun(job: string, trigger: string, startedAt = new Date()): Promise<string | null> {
  try {
    const [row] = await getDb().insert(jobRuns).values({ job, trigger, status: "running", startedAt }).returning({ id: jobRuns.id })
    return row.id
  } catch (err) {
    log.logError("job.record_failed", err, { job }, "warn")
    return null
  }
}

/** Records how a run ended: its counts, or its error. */
export async function finishRun(id: string | null, status: Exclude<JobRunStatus, "running">, outcome: { result?: Record<string, unknown>; error?: string } = {}): Promise<void> {
  if (!id) return
  try {
    await getDb()
      .update(jobRuns)
      .set({ status, finishedAt: new Date(), result: outcome.result ?? null, error: outcome.error?.slice(0, 2000) ?? null })
      .where(eq(jobRuns.id, id))
  } catch (err) {
    log.logError("job.record_failed", err, { runId: id, status }, "warn")
  }
}

/** Records a run that didn't happen because the job is paused. */
export async function recordSkipped(job: string, trigger: string, reason: string): Promise<void> {
  const id = await startRun(job, trigger)
  await finishRun(id, "skipped", { result: { paused: reason } })
}
