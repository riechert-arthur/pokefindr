import "server-only"
import { z } from "zod/v3"
import { defineJob } from "@/server/lib/jobs/types"
import { recheckFailedReviews } from "./review-moderation"

/**
 * Runs daily (vercel.json), and a few minutes after a check fails. Safe to repeat.
 *
 * Its own file, not review-moderation.ts: that module queues this job, and the
 * queue imports the job registry, so defining the job there made a cycle that
 * left it uninitialized when the registry loaded (a 500 on POST /api/reviews).
 */
export const recheckHeldReviewsJob = defineJob({
  description: "Checks again held reviews whose moderation check failed",
  schema: z.unknown(),
  async run() {
    return recheckFailedReviews()
  },
})
