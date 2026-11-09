/** A job on the admin's Jobs page (#157). */
export interface JobInfo {
  name: string
  description: string
  /** How it's started: "Cron · daily 06:05 UTC", "Queue · per submission", "Deploy step". */
  trigger: string
  /** Whether Run now can start it: jobs that need a payload (a submission) or aren't jobs (the import) can't. */
  runnable: boolean
  /** Paused from the code: it can't be resumed here (location-sync until #85). */
  blocked?: string
}

export interface JobRow extends JobInfo {
  lastRun: { status: "running" | "succeeded" | "failed" | "skipped"; startedAt: string; finishedAt: string | null; result: Record<string, unknown> | null; error: string | null; trigger: string } | null
  /** Why it's paused (a pause flag or `blocked`), or null. */
  paused: string | null
  /** Paused with the pause flag, which Resume clears. */
  pausedHere: boolean
}

/** "5 6 * * *" → "daily 06:05 UTC"; other schedules as written. */
export function cronText(schedule: string): string {
  const m = /^(\d+) (\d+) \* \* \*$/.exec(schedule.trim())
  return m ? `daily ${m[2].padStart(2, "0")}:${m[1].padStart(2, "0")} UTC` : schedule
}

/** "1,457 staged · 0 inserted": a run's numeric counts, in order. */
export function resultText(result: Record<string, unknown> | null): string {
  if (!result) return ""
  if (typeof result.paused === "string") return `Skipped: ${result.paused}`
  return Object.entries(result)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => `${(v as number).toLocaleString("en-US")} ${k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}`)
    .join(" · ")
}
