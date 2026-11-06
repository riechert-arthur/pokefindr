/** How a job run was started. */
export type JobTrigger = "cron" | "queue" | "inline" | "cli"

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
  /** One line, shown in logs and docs. */
  description: string
  /**
   * Does the work. Must be idempotent: queue delivery is at least once, and a
   * cron run can overlap a retry.
   */
  run(payload: P, ctx: JobContext): Promise<JobResult | void>
}
