import "server-only"
import type { Job } from "./types"

/** Does nothing. Exists so the cron, queue and CLI wiring can be tested on its own. */
const noop: Job = {
  description: "Does nothing; checks that job wiring works",
  async run(payload, ctx) {
    return { trigger: ctx.trigger, payload: payload ?? null }
  },
}

/**
 * Every job, by name. A name is part of a URL (`/api/jobs/<name>`) and of queue
 * messages, so keep it kebab-case and don't rename one that is scheduled or
 * may have messages in flight.
 */
export const jobs = {
  noop,
} satisfies Record<string, Job>

export type JobName = keyof typeof jobs

export function isJobName(name: string): name is JobName {
  return Object.prototype.hasOwnProperty.call(jobs, name)
}
