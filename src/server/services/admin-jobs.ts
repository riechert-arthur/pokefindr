import "server-only"
import { desc, eq, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { jobPauses, jobRuns } from "@/server/db/schema"
import { jobs } from "@/server/lib/jobs/registry"
import { cronText, type JobInfo, type JobRow } from "@/lib/admin/jobs"
import vercel from "../../../vercel.json"

const cronOf = (name: string) => vercel.crons.find((c) => c.path === `/api/jobs/${name}`)?.schedule

/** Jobs that need a payload, run per item from the queue: Run now can't start them. */
const PER_ITEM: Record<string, string> = { "submission-created": "Queue · per submission", "submission-reviewed": "Queue · per decision" }

/**
 * The jobs the admin lists (#157): the location import (a deploy step, not a
 * registered job), location-sync (planned, paused until #85 finds a data
 * source), and every registered job but the wiring check.
 */
export function jobCatalog(): JobInfo[] {
  const registered = Object.entries(jobs)
    .filter(([name]) => name !== "noop")
    .map(([name, job]): JobInfo => {
      const cron = cronOf(name)
      return { name, description: job.description, trigger: PER_ITEM[name] ?? (cron ? `Cron · ${cronText(cron)}` : "On demand"), runnable: !PER_ITEM[name] }
    })
  return [
    { name: "location-import", description: "Loads the official vending list into locations on each deploy", trigger: "Deploy step", runnable: false },
    { name: "location-sync", description: "Pulls vending updates on a schedule", trigger: "Cron · daily 09:00 UTC", runnable: false, blocked: "Waiting on an approved data source (#85)" },
    ...registered,
  ]
}

/** Each job with its last run and whether it's paused. */
export async function listJobs(db: Database = getDb()): Promise<JobRow[]> {
  const catalog = jobCatalog()
  const [last, pauses] = await Promise.all([
    db
      .selectDistinctOn([jobRuns.job])
      .from(jobRuns)
      .where(sql`${jobRuns.job} in (${sql.join(catalog.map((j) => sql`${j.name}`), sql`, `)})`)
      .orderBy(jobRuns.job, desc(jobRuns.startedAt)),
    db.select().from(jobPauses),
  ])
  const lastBy = new Map(last.map((r) => [r.job, r]))
  const pauseBy = new Map(pauses.map((p) => [p.job, p.reason]))
  return catalog.map((j) => {
    const r = lastBy.get(j.name)
    const flag = pauseBy.get(j.name) ?? null
    return {
      ...j,
      lastRun: r
        ? { status: r.status, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, result: r.result ?? null, error: r.error, trigger: r.trigger }
        : null,
      paused: j.blocked ?? flag,
      pausedHere: !j.blocked && flag !== null,
    }
  })
}

/** Pauses a registered job; cron runs skip it, and queue messages wait, until resumed. */
export async function pauseJob(name: string, reason: string, adminId: string, db: Database = getDb()) {
  await db.insert(jobPauses).values({ job: name, reason, pausedBy: adminId }).onConflictDoUpdate({ target: jobPauses.job, set: { reason, pausedBy: adminId, pausedAt: new Date() } })
}

export async function resumeJob(name: string, db: Database = getDb()) {
  await db.delete(jobPauses).where(eq(jobPauses.job, name))
}
