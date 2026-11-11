/**
 * Which jobs run on a schedule, and when (#324). Vercel reads crons from
 * vercel.json, which can't import code, so `npm run modules:sync` writes them
 * there from this list (core's jobs) and each module manifest's `jobs`; a
 * test fails if vercel.json is out of date. Change a schedule here or in the
 * module, never in vercel.json.
 *
 * Client-safe (no "server-only"), so the sync script can read it without
 * loading the jobs' code.
 */
import { moduleJobSchedules } from "@/core/shell/contributions"
import type { ModuleManifest } from "@/core/shell/module"

/** Core's scheduled jobs, by name (src/server/lib/jobs/registry.ts). Times are UTC. */
export const CORE_CRONS: readonly { name: string; schedule: string }[] = [
  { name: "noop", schedule: "0 6 * * *" },
  { name: "expire-events", schedule: "5 6 * * *" },
  { name: "refresh-region-counts", schedule: "15 6 * * *" },
  { name: "assistant-retention", schedule: "30 6 * * *" },
  { name: "prune-rate-limits", schedule: "45 6 * * *" },
  { name: "recheck-held-reviews", schedule: "50 6 * * *" },
]

/** vercel.json's `crons`: core's, then each module's scheduled jobs, in registry order. */
export function cronsFor(modules: readonly ModuleManifest[]): { path: string; schedule: string }[] {
  const scheduled = [...CORE_CRONS, ...moduleJobSchedules(modules).filter((j): j is typeof j & { schedule: string } => !!j.schedule)]
  return scheduled.map((j) => ({ path: `/api/jobs/${j.name}`, schedule: j.schedule }))
}
