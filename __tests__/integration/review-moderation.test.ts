import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { enqueued } = vi.hoisted(() => ({ enqueued: [] as string[] }))
vi.mock("@/server/lib/jobs/enqueue", () => ({
  enqueueJob: async (job: string) => {
    enqueued.push(job)
    return { mode: "queued", messageId: null }
  },
}))

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { eq } from "drizzle-orm"
import { getDb } from "@/server/db/client"
import { locationRatings, locationSubmissions, locations, reviewModerationChecks } from "@/server/db/schema"
import { setModeratorForTests } from "@/server/container"
import { FakeModerator } from "@/server/adapters/moderator/fake"
import type { ContentModerator } from "@/server/ports/moderator"
import { addReview, getPanelReviews, listLocationReviews, listUserReviews, updateReview } from "@/server/services/reviews"
import { decideReview, heldReviewCount, listDecidedReviews, listHeldReviews, recheckFailedReviews } from "@/server/services/review-moderation"
import { createSubmission } from "@/server/services/submissions"
import { listQueue } from "@/server/services/moderation"
import { runTool } from "@/server/assistant/tools"
import { POST as postReview } from "@/app/api/reviews/route"
import { PATCH as patchReview } from "@/app/api/reviews/[id]/route"
import { GET as adminList } from "@/app/api/admin/reviews/route"
import { POST as adminDecide } from "@/app/api/admin/reviews/[id]/route"
import { GET as summaryRoute } from "@/app/api/admin/summary/route"
import { GET as panelRoute } from "@/app/api/locations/[id]/reviews/route"
import { POST as mcpPost } from "@/app/api/mcp/route"
import { resetMcpLimitsForTests } from "@/server/mcp/limits"
import { FakeGeocoder } from "@/server/adapters/geocoder/fake"
import { UNDO_MS } from "@/lib/submissions/moderation"
import { insertProfiles } from "./testDatabase"

const AUTHOR = randomUUID()
const OTHER = randomUUID()
const MOD = randomUUID()
const ADMIN = randomUUID()
const ABUSIVE = "The cashier is an idiot who can't count change."
let store: string

/** A moderator that's down: every check throws. */
const down: ContentModerator = { check: async () => Promise.reject(new Error("API down")) }

beforeEach(async () => {
  enqueued.length = 0
  setModeratorForTests(new FakeModerator())
  resetMcpLimitsForTests()
  await insertProfiles(getDb(), [
    { id: AUTHOR, username: "ash" },
    { id: OTHER, username: "brock" },
    { id: MOD, username: "misty", role: "moderator" },
    { id: ADMIN, username: "erika", role: "admin" },
  ])
  const [row] = await getDb()
    .insert(locations)
    .values({ machineId: "S1", retailer: "Safeway", address: "1 Pike St", city: "Seattle", state: "WA", geog: { lng: -122.34, lat: 47.61 } })
    .returning({ id: locations.id })
  store = row.id
})

afterEach(() => {
  setModeratorForTests(null)
  vi.restoreAllMocks()
})

const checksOf = (ratingId: string) => getDb().select().from(reviewModerationChecks).where(eq(reviewModerationChecks.ratingId, ratingId))
const req = (url: string, userId: string | null, body?: unknown, method = body ? "POST" : "GET") =>
  new NextRequest(`http://localhost${url}`, { method, headers: { ...(userId && { "x-user-id": userId }), "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250)}` }, body: body ? JSON.stringify(body) : undefined })

async function mcpGetPlace(id: string) {
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/api/mcp"), { fetch: (url, init) => mcpPost(new Request(url, init)) })
  const client = new Client({ name: "pokefindr-test", version: "1.0.0" })
  await client.connect(transport)
  const r = await client.callTool({ name: "get_place", arguments: { id } })
  await client.close()
  return r.structuredContent as { reviews: { count: number }; recent_reviews: { items: { untrusted_text: string }[] } }
}

describe("checking reviews", () => {
  it("publishes clean text, and records the check", async () => {
    const added = await addReview({ locationId: store, userId: AUTHOR, rating: 1, text: "This machine is trash, always empty." })
    expect(added).toEqual({ id: expect.any(String), status: "published", checkFailed: false })
    expect(await checksOf(added!.id)).toEqual([expect.objectContaining({ verdict: "allow", model: "fake", failed: false, categories: [] })])
    expect((await getPanelReviews(store, null)).count).toBe(1)
  })

  it("skips the check for a rating without text", async () => {
    const check = vi.fn()
    const added = await addReview({ locationId: store, userId: AUTHOR, rating: 4, text: "" }, getDb(), { check })
    expect(added?.status).toBe("published")
    expect(check).not.toHaveBeenCalled()
    expect(await checksOf(added!.id)).toEqual([])
  })

  it("holds an abusive review: only its author sees it, as pending", async () => {
    const added = await addReview({ locationId: store, userId: AUTHOR, rating: 1, text: ABUSIVE })
    expect(added?.status).toBe("held")
    expect(await checksOf(added!.id)).toEqual([expect.objectContaining({ verdict: "hold", categories: ["harassment"], reason: expect.any(String) })])

    // Public reads: the panel signed out and as someone else, the old route, get_place, MCP.
    expect(await getPanelReviews(store, null)).toEqual({ reviews: [], count: 0, average: 0 })
    expect((await getPanelReviews(store, OTHER)).reviews).toEqual([])
    expect(await listLocationReviews(store)).toEqual([])
    const tool = await runTool("get_place", { id: store }, { db: getDb(), geocoder: new FakeGeocoder(), viewer: null, now: new Date() })
    expect(tool.ok && tool.data).toMatchObject({ reviews: { count: 0 }, recent_reviews: { items: [] } })
    expect(await mcpGetPlace(store)).toMatchObject({ reviews: { count: 0 }, recent_reviews: { items: [] } })
    const panel = await panelRoute(req(`/api/locations/${store}/reviews`, null), { params: Promise.resolve({ id: store }) })
    expect(((await panel.json()) as { reviews: unknown[] }).reviews).toEqual([])

    // Its author sees it, marked, but it isn't counted.
    const mine = await getPanelReviews(store, AUTHOR)
    expect(mine.reviews).toEqual([expect.objectContaining({ id: added!.id, status: "held", mine: true, text: ABUSIVE })])
    expect(mine.count).toBe(0)
    expect((await listUserReviews(AUTHOR))[0].status).toBe("held")
  })

  it("checks edits again, both ways", async () => {
    const added = await addReview({ locationId: store, userId: AUTHOR, rating: 3, text: "Fine." })
    expect(await updateReview(added!.id, AUTHOR, { rating: 1, text: ABUSIVE })).toEqual({ status: "held", checkFailed: false })
    expect(await listLocationReviews(store)).toEqual([])
    expect(await updateReview(added!.id, AUTHOR, { rating: 2, text: "Empty again." })).toEqual({ status: "published", checkFailed: false })
    expect(await listLocationReviews(store)).toEqual([{ rating: 2, text: "Empty again.", username: "ash" }])
    expect(await checksOf(added!.id)).toHaveLength(3)
  })

  it("holds a review when the check fails or times out, and the recheck publishes it once the check works", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const added = await addReview({ locationId: store, userId: AUTHOR, rating: 5, text: "Restocked Tuesday." }, getDb(), down)
    expect(added).toMatchObject({ status: "held", checkFailed: true })
    expect(await checksOf(added!.id)).toEqual([expect.objectContaining({ verdict: "hold", failed: true, model: "none" })])
    expect(await listLocationReviews(store)).toEqual([])

    const slow: ContentModerator = { check: () => new Promise(() => {}) }
    const timedOut = await addReview({ locationId: store, userId: OTHER, rating: 4, text: "Good spot." }, getDb(), slow)
    expect(timedOut).toMatchObject({ status: "held", checkFailed: true })

    // Still down: nothing changes.
    expect(await recheckFailedReviews(getDb(), down)).toMatchObject({ published: 0, stillFailing: 1 })
    // Back up: both are checked and published.
    expect(await recheckFailedReviews(getDb(), new FakeModerator())).toMatchObject({ found: 2, published: 2 })
    expect((await listLocationReviews(store)).map((r) => r.text).sort()).toEqual(["Good spot.", "Restocked Tuesday."])
    // Nothing left to recheck.
    expect(await recheckFailedReviews(getDb(), new FakeModerator())).toMatchObject({ found: 0 })
  }, 15_000)

  it("doesn't recheck reviews held on purpose or already decided", async () => {
    const held = await addReview({ locationId: store, userId: AUTHOR, rating: 1, text: ABUSIVE })
    expect(await recheckFailedReviews(getDb(), new FakeModerator())).toMatchObject({ found: 0 })
    expect(held?.status).toBe("held")
  })

  it("returns the status from the routes, and queues a recheck after a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const ok = await postReview(req("/api/reviews", AUTHOR, { locationId: store, rating: 4, text: ABUSIVE }))
    const body = (await ok.json()) as { id: string; status: string }
    expect(body.status).toBe("held")
    expect(enqueued).toEqual([])

    setModeratorForTests(down)
    const patched = await patchReview(req(`/api/reviews/${body.id}`, AUTHOR, { rating: 4, text: "Clean now." }, "PATCH"), { params: Promise.resolve({ id: body.id }) })
    expect(await patched.json()).toEqual({ success: true, status: "held" })
    expect(enqueued).toEqual(["recheck-held-reviews"])
  })
})

describe("the held-reviews queue", () => {
  it("lists held reviews with the model's reason, for moderators only", async () => {
    const held = await addReview({ locationId: store, userId: AUTHOR, rating: 1, text: ABUSIVE })
    await addReview({ locationId: store, userId: OTHER, rating: 5, text: "Stocked." })
    expect(await heldReviewCount()).toBe(1)
    const [item] = await listHeldReviews(MOD)
    expect(item).toMatchObject({
      id: held!.id,
      text: ABUSIVE,
      author: "ash",
      status: "held",
      writtenByViewer: false,
      location: { id: store, name: "Safeway", city: "Seattle", state: "WA", kind: "vending" },
      check: { verdict: "hold", categories: ["harassment"], model: "fake", failed: false },
    })

    expect((await adminList(req("/api/admin/reviews", AUTHOR))).status).toBe(404)
    const res = await adminList(req("/api/admin/reviews", MOD))
    expect(((await res.json()) as { held: unknown[] }).held).toHaveLength(1)
    const summary = (await (await summaryRoute(req("/api/admin/summary", MOD))).json()) as { reviews?: { held: number } }
    expect(summary.reviews).toEqual({ held: 1 })
  })

  it("approves, removes and undoes, within the hour, by the moderator who decided", async () => {
    const a = (await addReview({ locationId: store, userId: AUTHOR, rating: 1, text: ABUSIVE }))!.id
    const decide = (id: string, action: string, as = MOD) => adminDecide(req(`/api/admin/reviews/${id}`, as, { action }), { params: Promise.resolve({ id }) })

    expect((await decide(a, "approve", AUTHOR)).status).toBe(404)
    expect(await (await decide(a, "approve")).json()).toEqual({ ok: true, status: "published" })
    expect(await listLocationReviews(store)).toHaveLength(1)
    expect((await decide(a, "remove")).status).toBe(409)
    expect((await listDecidedReviews(MOD)).map((r) => r.id)).toEqual([a])

    // Someone else can't undo it; the moderator can.
    expect((await decide(a, "undo", ADMIN)).status).toBe(409)
    expect(await (await decide(a, "undo")).json()).toEqual({ ok: true, status: "held" })
    expect(await listLocationReviews(store)).toEqual([])

    expect(await (await decide(a, "remove")).json()).toEqual({ ok: true, status: "removed" })
    expect(await listLocationReviews(store)).toEqual([])
    expect((await getPanelReviews(store, AUTHOR)).reviews[0].status).toBe("removed")

    // Past the hour, the undo is refused.
    expect(await decideReview(a, "undo", MOD, getDb(), new Date(Date.now() + UNDO_MS + 60_000))).toEqual({ status: "too_late" })
  })

  it("sends a removed review back to the queue when its author edits it, whatever the check says", async () => {
    const a = (await addReview({ locationId: store, userId: AUTHOR, rating: 1, text: ABUSIVE }))!.id
    await decideReview(a, "remove", MOD)
    expect(await updateReview(a, AUTHOR, { rating: 3, text: "Fine, I take it back." })).toMatchObject({ status: "held" })
    const [row] = await getDb().select().from(locationRatings).where(eq(locationRatings.id, a))
    expect(row).toMatchObject({ status: "held", moderatedBy: null, moderatedAt: null })
  })

  it("lets a moderator decide their own review only with moderation.decideOwn", async () => {
    const mine = (await addReview({ locationId: store, userId: MOD, rating: 1, text: ABUSIVE }))!.id
    expect(await decideReview(mine, "approve", MOD)).toEqual({ status: "own" })
    expect((await listHeldReviews(MOD))[0].writtenByViewer).toBe(true)
    const adminOwn = (await addReview({ locationId: store, userId: ADMIN, rating: 1, text: ABUSIVE }))!.id
    expect(await decideReview(adminOwn, "approve", ADMIN)).toEqual({ status: "done", review: "published" })
  })
})

describe("checking submissions", () => {
  it("stores the text check and shows it among the queue's checks, without rejecting anything", async () => {
    const result = await createSubmission({
      userId: AUTHOR,
      input: { kind: "shop", name: "Use code PIKA20 Cards", address: "9 Main St", city: "Seattle", state: "WA", countryCode: "US", lng: -122.3, lat: 47.6, sells: [] } as never,
    })
    expect(result.status).toBe("created")
    const [row] = await getDb().select().from(locationSubmissions)
    expect(row).toMatchObject({ status: "pending", textCheck: { verdict: "hold", categories: ["spam"], failed: false, model: "fake" } })
    const [item] = await listQueue(MOD)
    expect(item.checks.find((c) => c.key === "text")).toMatchObject({ ok: false, label: "Text flagged: Spam or ads" })
  })
})
