import { handleCallback } from "@vercel/queue"
import { handleJobMessage, retryJobMessage } from "@/server/jobs/consumer"

const consume = handleCallback(handleJobMessage, {
  // The SDK keeps extending this while the handler runs; it only matters if the function dies.
  visibilityTimeoutSeconds: 300,
  retry: retryJobMessage,
})

/**
 * Vercel Queues consumer for the `jobs` topic (see `vercel.json`). Only
 * Vercel's queue infrastructure can invoke it. Messages come from
 * `enqueueJob()`; the job runs through the same registry as cron and the CLI.
 *
 * Wrapped in a plain function because Next.js requires a route's first
 * argument to be typed as `Request`.
 */
export async function POST(request: Request): Promise<Response> {
  return consume(request)
}
