import "server-only"
import { z } from "zod/v3"
import { defineJob, type Job } from "./types"
import { refreshRegionCountsJob } from "@/server/services/region-counts"
import { assistantRetentionJob } from "@/server/assistant/log"
import { submissionCreatedJob, submissionReviewedJob } from "@/server/services/submission-notifications"
import { expireEventsJob } from "@/server/services/expire-events"
import { pruneRateLimitsJob } from "@/server/adapters/rate-limiter/postgres"
import { recheckHeldReviewsJob } from "@/server/services/recheck-held-reviews"
import { moduleJobs } from "@/core/shell/server-slots"
import { SERVER_MODULES } from "@/modules/registry.server"

/** Does nothing. Exists so the cron, queue and CLI wiring can be tested on its own. */
const noop = defineJob({
  description: "Does nothing; checks that job wiring works",
  schema: z.unknown(),
  async run(payload, ctx) {
    return { trigger: ctx.trigger, payload: payload ?? null }
  },
})

/**
 * Every job, by name. Job logic lives in `src/server/services/`; this only maps
 * names to it. A name is part of a URL (`/api/jobs/<name>`) and of queue
 * messages, so keep it kebab-case and don't rename one that is scheduled or
 * may have messages in flight.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each job keeps its own payload type
export const jobs: Record<string, Job<any>> = {
  noop,
  "refresh-region-counts": refreshRegionCountsJob,
  "assistant-retention": assistantRetentionJob,
  "submission-created": submissionCreatedJob,
  "submission-reviewed": submissionReviewedJob,
  "expire-events": expireEventsJob,
  "prune-rate-limits": pruneRateLimitsJob,
  "recheck-held-reviews": recheckHeldReviewsJob,
  // Each registered module's (`jobs`, #324), declared in its module.ts and coded in its module.server.ts.
  ...moduleJobs(SERVER_MODULES),
}

export function isJobName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(jobs, name)
}
