import type { ZodType } from "zod/v3"

/**
 * How a job run was started: Vercel Cron, Vercel Queues, another HTTP caller
 * (e.g. a manual POST or GitHub Actions), `enqueueJob()` off Vercel, or the CLI.
 */
export type JobTrigger = "cron" | "queue" | "http" | "inline" | "cli"

export interface JobContext {
  trigger: JobTrigger
  /** Queue message id, when the run came from Vercel Queues. */
  messageId?: string
  /** 1 on the first delivery; higher on retries. Queue runs only. */
  deliveryCount?: number
}

/** Plain, JSON-serializable data describing what the run did. */
export type JobResult = Record<string, unknown>

export interface Job<P = unknown> {
  /** One line, shown in logs, the CLI and docs. */
  description: string
  /**
   * Validates the payload before `run`. Payloads arrive as untrusted JSON from
   * HTTP bodies, queue messages and the CLI, so give every job that reads its
   * payload a schema. Without one, `run` receives `unknown` data.
   */
  schema?: ZodType<P>
  /**
   * Does the work. Must be idempotent: queue delivery is at least once, and a
   * cron run can overlap a retry.
   */
  run: (payload: P, ctx: JobContext) => Promise<JobResult | void>
}

/** Defines a job, inferring the payload type from its schema. */
export function defineJob<P>(job: Job<P>): Job<P> {
  return job
}
