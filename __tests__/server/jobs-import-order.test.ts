import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// The job queue imports the job registry, which imports every job. A module that
// queues a job must not also define one, or loading it first leaves that job
// uninitialized when the registry builds its list (a 500 on POST /api/reviews in
// #253). Load the routes that queue jobs first, in a fresh module graph, and check
// the registry still has every job.
const ROUTES: Record<string, () => Promise<unknown>> = {
  "POST /api/reviews": () => import("@/app/api/reviews/route"),
  "PATCH /api/reviews/[id]": () => import("@/app/api/reviews/[id]/route"),
}

describe("job registry", () => {
  for (const [name, load] of Object.entries(ROUTES)) {
    it(`has every job when ${name} is loaded first`, async () => {
      vi.resetModules()
      await load()
      const { jobs } = await import("@/server/lib/jobs/registry")
      for (const [job, def] of Object.entries(jobs)) expect(def, job).toBeDefined()
    })
  }
})
