import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import postgres from "postgres"
const { enqueued } = vi.hoisted(() => ({ enqueued: [] as string[] }))
vi.mock("@/server/lib/jobs/enqueue", () => ({
  enqueueJob: async (job: string) => {
    enqueued.push(job)
    return { mode: "queued", messageId: null }
  },
}))

import { getDb } from "@/server/db/client"
import { jobRuns } from "@/server/db/schema"
import { runJob } from "@/server/lib/jobs/run"
import { jobs } from "@/server/lib/jobs/registry"
import { pauseJob } from "@/server/services/admin-jobs"
import { GET as listRoute } from "@/app/api/admin/jobs/route"
import { POST as actRoute } from "@/app/api/admin/jobs/[name]/route"
import { createMigrator } from "../../scripts/db/migrator"
import { recordImportRun } from "../../scripts/one-off/import-locations"
import type { JobRow } from "@/lib/admin/jobs"
import { insertProfiles, testDatabaseUrl } from "./testDatabase"

const ADMIN = randomUUID()
const MOD = randomUUID()
const conn = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
const { db: kdb } = createMigrator(conn)
afterAll(() => conn.end({ timeout: 5 }))

beforeEach(async () => {
  enqueued.length = 0
  await insertProfiles(getDb(), [
    { id: ADMIN, username: "misty", role: "admin" },
    { id: MOD, username: "brock", role: "moderator" },
  ])
})

const list = async (userId = ADMIN) => ((await (await listRoute(new NextRequest("http://localhost/api/admin/jobs", { headers: { "x-user-id": userId } }))).json()) as { jobs: JobRow[] }).jobs
const act = (name: string, body: unknown, userId = ADMIN) =>
  actRoute(new NextRequest(`http://localhost/api/admin/jobs/${name}`, { method: "POST", headers: { "x-user-id": userId }, body: JSON.stringify(body) }), { params: Promise.resolve({ name }) })

describe("job run history", () => {
  it("records each run with its counts, and a failure with its error", async () => {
    await runJob("expire-events", null, { trigger: "cron" })
    const original = jobs["expire-events"].run
    jobs["expire-events"].run = async () => {
      throw new Error("database went away")
    }
    try {
      await expect(runJob("expire-events", null, { trigger: "queue" })).rejects.toThrow("database went away")
    } finally {
      jobs["expire-events"].run = original
    }
    const runs = await getDb().select().from(jobRuns).orderBy(jobRuns.startedAt)
    expect(runs.map((r) => [r.job, r.trigger, r.status, r.error])).toEqual([
      ["expire-events", "cron", "succeeded", null],
      ["expire-events", "queue", "failed", "database went away"],
    ])
    expect(runs[0].result).toEqual({ locations: 0, highlights: 0 })
    expect(runs[0].finishedAt).toBeInstanceOf(Date)
  })

  it("skips a paused job from cron, records why, and still runs it from the CLI", async () => {
    await pauseJob("expire-events", "Checking the event data", ADMIN)
    expect(await runJob("expire-events", null, { trigger: "cron" })).toEqual({ skipped: true, paused: "Checking the event data" })
    await runJob("expire-events", null, { trigger: "cli" })
    const runs = await getDb().select({ status: jobRuns.status, trigger: jobRuns.trigger }).from(jobRuns).orderBy(jobRuns.startedAt)
    expect(runs).toEqual([
      { status: "skipped", trigger: "cron" },
      { status: "succeeded", trigger: "cli" },
    ])
  })
})

describe("/api/admin/jobs", () => {
  it("lists the import, location-sync and the registered jobs with their last run", async () => {
    await recordImportRun(kdb, new Date(), { status: "succeeded", result: { staged: 1457, inserted: 0, updated: 2, unchanged: 1455 } })
    await runJob("refresh-region-counts", null, { trigger: "cron" })
    const rows = await list()
    const by = Object.fromEntries(rows.map((r) => [r.name, r]))
    expect(Object.keys(by)).toEqual(expect.arrayContaining(["location-import", "location-sync", "expire-events", "refresh-region-counts", "submission-created", "submission-reviewed"]))
    expect(by.noop).toBeUndefined()
    expect(by["location-import"]).toMatchObject({ trigger: "Deploy step", runnable: false, lastRun: { status: "succeeded", trigger: "deploy", result: { staged: 1457 } } })
    expect(by["location-sync"]).toMatchObject({ paused: "Waiting on an approved data source (#85)", pausedHere: false, lastRun: null })
    expect(by["expire-events"].trigger).toBe("Cron · daily 06:05 UTC")
    expect(by["refresh-region-counts"].lastRun?.status).toBe("succeeded")
    expect(by["submission-created"]).toMatchObject({ trigger: "Queue · per submission", runnable: false })
  })

  it("runs a job now, but not a paused one or one that runs per item", async () => {
    expect((await act("expire-events", { action: "run" })).status).toBe(200)
    expect(enqueued).toEqual(["expire-events"])
    expect((await act("submission-created", { action: "run" })).status).toBe(409)
    expect((await act("location-sync", { action: "run" })).status).toBe(404)
    expect((await act("expire-events", { action: "pause", reason: "Checking" })).status).toBe(200)
    expect((await list()).find((j) => j.name === "expire-events")).toMatchObject({ paused: "Checking", pausedHere: true })
    expect((await act("expire-events", { action: "run" })).status).toBe(409)
    expect((await act("expire-events", { action: "resume" })).status).toBe(200)
    expect((await list()).find((j) => j.name === "expire-events")).toMatchObject({ paused: null, pausedHere: false })
    expect(enqueued).toEqual(["expire-events"])
  })

  it("is for admins only", async () => {
    expect((await listRoute(new NextRequest("http://localhost/api/admin/jobs", { headers: { "x-user-id": MOD } }))).status).toBe(404)
    expect((await act("expire-events", { action: "run" }, MOD)).status).toBe(404)
  })
})
