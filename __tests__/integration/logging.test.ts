import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { NextRequest } from "next/server"
vi.mock("@/server/lib/jobs/enqueue", () => ({ enqueueJob: async () => ({ mode: "queued", messageId: null }) }))

import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { POST as addReviewRoute } from "@/app/api/reviews/route"
import { POST as decideRoute } from "@/app/api/admin/submissions/[id]/route"
import { POST as jobRoute } from "@/app/api/admin/jobs/[name]/route"
import { POST as loginRoute } from "@/app/api/auth/login/route"
import { resetAuthForTests } from "@/server/auth/auth"
import { createSubmission } from "@/server/services/submissions"
import { timed } from "@/server/log"
import { insertProfiles } from "./testDatabase"

/** The logger's JSON lines (#254), from console.info and console.error. */
let written: string[]
beforeEach(() => {
  written = []
  const keep = (line: unknown) => void written.push(String(line))
  vi.spyOn(console, "info").mockImplementation(keep)
  vi.spyOn(console, "error").mockImplementation(keep)
})
afterEach(() => vi.restoreAllMocks())
const lines = () => written.filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as Record<string, unknown>)

const ASH = randomUUID()
const MOD = randomUUID()
const ADMIN = randomUUID()

beforeEach(async () => {
  await insertProfiles(getDb(), [
    { id: ASH, username: "ash" },
    { id: MOD, username: "brock", role: "moderator" },
    { id: ADMIN, username: "misty", role: "admin" },
  ])
})

describe("a failed database write (#254)", () => {
  it("logs one line with the Postgres code and the request, and none of the inserted values", async () => {
    const [store] = await getDb().insert(locations).values({ machineId: "LOG1", retailer: "Frys", geog: { lng: -111.544047, lat: 33.413887 } }).returning({ id: locations.id })
    // Reviews have no unique key of their own: add one for this test, so the second review fails with 23505.
    await getDb().execute(sql`create unique index logging_test_one_review on location_ratings (user_id, location_id)`)
    try {
      const text = "Next to 12 Elm St, write me at ash@example.com"
      const post = () =>
        addReviewRoute(
          new NextRequest("http://localhost/api/reviews", {
            method: "POST",
            headers: { "x-user-id": ASH, "x-vercel-id": "iad1::req-1" },
            body: JSON.stringify({ locationId: store.id, rating: 5, text }),
          }),
        )
      expect((await post()).status).toBe(200)
      written.length = 0
      expect((await post()).status).toBe(500)

      expect(lines()).toEqual([
        expect.objectContaining({
          level: "error",
          event: "db.write_failed",
          requestId: "iad1::req-1",
          route: "/api/reviews",
          write: "review",
          errorName: "DrizzleQueryError",
          code: "23505",
          constraint: "logging_test_one_review",
        }),
      ])
      const out = written.join("\n")
      expect(out).not.toContain("params:")
      expect(out).not.toMatch(/insert into|Elm St|example\.com/)
      expect(out).not.toContain(ASH)
      expect(out).not.toContain(store.id)
    } finally {
      await getDb().execute(sql`drop index if exists logging_test_one_review`)
    }
  })
})

describe("a slow query (#254)", () => {
  it("logs db.slow with its name and time, not its SQL", async () => {
    await timed("sleepy", () => getDb().execute(sql`select pg_sleep(0.6), ${"ash@example.com"}::text`))
    const [line] = lines()
    expect(line).toMatchObject({ level: "warn", event: "db.slow", op: "sleepy" })
    expect(line.ms).toBeGreaterThanOrEqual(500)
    expect(written.join("\n")).not.toMatch(/pg_sleep|example\.com/)
  })
})

describe("the admin trail (#254)", () => {
  it("logs an approval with the moderator's id", async () => {
    const created = await createSubmission({
      userId: ASH,
      input: { kind: "shop", name: "Mile High Cards", lng: -104.9876, lat: 39.7392, address: "1450 Grant St", city: "Denver", state: "CO", countryCode: "US", sells: ["singles"] },
      confirmDuplicate: true,
    })
    if (created.status !== "created") throw new Error(created.status)
    const res = await decideRoute(
      new NextRequest(`http://localhost/api/admin/submissions/${created.id}`, { method: "POST", headers: { "x-user-id": MOD }, body: JSON.stringify({ action: "approve" }) }),
      { params: Promise.resolve({ id: created.id }) },
    )
    expect(res.status).toBe(200)
    expect(lines().filter((l) => String(l.event).startsWith("admin."))).toEqual([
      { level: "info", event: "admin.submission.approve", route: "/api/admin/submissions/[id]", action: "submission.approve", actorId: MOD, target: created.id, outcome: "done" },
    ])
    expect(written.join("\n")).not.toMatch(/Grant St|39\.7392/)
  })

  it("logs pausing and resuming a job with the admin's id", async () => {
    const act = (action: string) =>
      jobRoute(new NextRequest("http://localhost/api/admin/jobs/expire-events", { method: "POST", headers: { "x-user-id": ADMIN }, body: JSON.stringify({ action }) }), {
        params: Promise.resolve({ name: "expire-events" }),
      })
    expect((await act("pause")).status).toBe(200)
    expect((await act("resume")).status).toBe(200)
    expect(lines().filter((l) => String(l.event).startsWith("admin.")).map(({ event, actorId, target, outcome }) => ({ event, actorId, target, outcome }))).toEqual([
      { event: "admin.job.pause", actorId: ADMIN, target: "expire-events", outcome: "done" },
      { event: "admin.job.resume", actorId: ADMIN, target: "expire-events", outcome: "done" },
    ])
  })
})

describe("security lines (#254)", () => {
  it("logs a failed login with Better Auth's code, not the email", async () => {
    resetAuthForTests()
    const res = await loginRoute(new NextRequest("http://localhost:3000/api/auth/login", { method: "POST", body: JSON.stringify({ email: "nobody@example.com", password: "not-the-password!!" }) }))
    expect(res.status).toBe(401)
    expect(lines().filter((l) => l.event === "security.auth_failed")).toEqual([{ level: "info", event: "security.auth_failed", route: "/api/auth/login", type: "login", code: "INVALID_EMAIL_OR_PASSWORD", status: 401 }])
    expect(written.join("\n")).not.toMatch(/nobody|example\.com|not-the-password/)
  })
})
