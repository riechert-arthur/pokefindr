import { beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { enqueued } = vi.hoisted(() => ({ enqueued: [] as string[] }))
vi.mock("@/server/lib/jobs/enqueue", () => ({
  enqueueJob: async (job: string) => {
    enqueued.push(job)
    return { mode: "queued", messageId: null }
  },
}))

import { eq } from "drizzle-orm"
import { getDb } from "@/server/db/client"
import { locations, reportActions, statusReports } from "@/server/db/schema"
import { GET as listRoute } from "@/app/api/admin/reports/route"
import { POST as actRoute } from "@/app/api/admin/reports/[locationId]/route"
import { GET as summaryRoute } from "@/app/api/admin/summary/route"
import { getLocationsNear } from "@/server/services/locations"
import { insertProfiles } from "./testDatabase"

const MEMBER = randomUUID()
const OTHER = randomUUID()
const THIRD = randomUUID()
const MOD = randomUUID()

let kroger: string
let safeway: string

beforeEach(async () => {
  enqueued.length = 0
  await insertProfiles(getDb(), [
    { id: MEMBER, username: "ash" },
    { id: OTHER, username: "brock" },
    { id: THIRD, username: "gary" },
    { id: MOD, username: "misty", role: "moderator" },
  ])
  const rows = await getDb()
    .insert(locations)
    .values([
      { machineId: "Q1", retailer: "Kroger", address: "1 Main St", city: "Denver", state: "CO", geog: { lng: -104.99, lat: 39.74 } },
      { machineId: "Q2", retailer: "Safeway", address: "2 Main St", city: "Denver", state: "CO", geog: { lng: -104.98, lat: 39.74 } },
    ])
    .returning({ id: locations.id, machineId: locations.machineId })
  kroger = rows.find((r) => r.machineId === "Q1")!.id
  safeway = rows.find((r) => r.machineId === "Q2")!.id
  await getDb()
    .insert(statusReports)
    .values([
      { locationId: kroger, userId: MEMBER, reason: "gone" },
      { locationId: kroger, userId: OTHER, reason: "gone" },
      { locationId: kroger, userId: THIRD, reason: "empty" },
      { locationId: safeway, userId: MEMBER, reason: "wrong_location" },
    ])
})

const req = (url: string, userId: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: body ? "POST" : "GET", headers: { "x-user-id": userId }, body: body ? JSON.stringify(body) : undefined })
const list = async (userId = MOD) => ((await (await listRoute(req("/api/admin/reports", userId))).json()) as { locations: { location: { id: string; hidden: boolean }; open: number; status: string; reason: string; lastAction: { action: string; by: string } | null }[] }).locations
const act = (id: string, action: string, userId = MOD) => actRoute(req(`/api/admin/reports/${id}`, userId, { action }), { params: Promise.resolve({ locationId: id }) })
const near = async () => (await getLocationsNear({ center: [-104.99, 39.74], radiusMiles: 5, types: ["vending"] })).features.map((f) => f.properties.id)

describe("admin reports", () => {
  it("lists each reported location once, most reported first, with the most common reason", async () => {
    const rows = await list()
    expect(rows.map((r) => [r.location.id, r.open, r.reason, r.status])).toEqual([
      [kroger, 3, "gone", "open"],
      [safeway, 1, "wrong_location", "open"],
    ])
  })

  it("is for staff only", async () => {
    expect((await listRoute(req("/api/admin/reports", MEMBER))).status).toBe(404)
    expect((await act(kroger, "dismiss", MEMBER)).status).toBe(404)
    expect(await getDb().select().from(reportActions)).toEqual([])
  })

  it("dismisses or marks fixed: the reports close, the location stays, and who did it is kept", async () => {
    expect((await act(kroger, "dismiss")).status).toBe(200)
    expect((await act(safeway, "fix")).status).toBe(200)
    const rows = await list()
    expect(rows.map((r) => [r.location.id, r.status, r.lastAction?.by])).toEqual(
      expect.arrayContaining([
        [kroger, "dismissed", "misty"],
        [safeway, "fixed", "misty"],
      ]),
    )
    expect(await near()).toEqual(expect.arrayContaining([kroger, safeway]))
    // Nothing left to act on.
    expect((await act(kroger, "fix")).status).toBe(409)
    expect(enqueued).toEqual([])
  })

  it("hides a location from the map for everyone, and Reopen brings it and its reports back", async () => {
    expect((await act(kroger, "hide")).status).toBe(200)
    expect(await near()).toEqual([safeway])
    const [row] = await getDb().select().from(locations).where(eq(locations.id, kroger))
    expect(row).toMatchObject({ isActive: false, hiddenBy: MOD })
    expect(row.hiddenAt).toBeInstanceOf(Date)
    expect((await list()).find((r) => r.location.id === kroger)).toMatchObject({ status: "hidden", open: 0, location: { hidden: true } })
    expect(enqueued).toEqual(["refresh-region-counts"])

    expect((await act(kroger, "reopen")).status).toBe(200)
    expect(await near()).toEqual(expect.arrayContaining([kroger, safeway]))
    expect((await list()).find((r) => r.location.id === kroger)).toMatchObject({ status: "open", open: 3, location: { hidden: false } })
    // Reopening twice has nothing to undo.
    expect((await act(kroger, "reopen")).status).toBe(409)
    // The history stays: hide, then reopen.
    const history = await getDb().select({ action: reportActions.action, reports: reportActions.reports }).from(reportActions).orderBy(reportActions.createdAt)
    expect(history).toEqual([
      { action: "hide", reports: 3 },
      { action: "reopen", reports: 3 },
    ])
  })

  it("only reopens what the last action closed", async () => {
    await act(kroger, "dismiss")
    // A new report after the dismissal is open on its own.
    await getDb().insert(statusReports).values({ locationId: kroger, userId: MEMBER, reason: "empty" })
    await act(kroger, "fix")
    await act(kroger, "reopen")
    const open = await getDb().select().from(statusReports).where(eq(statusReports.locationId, kroger))
    expect(open.filter((r) => r.resolvedAt === null)).toHaveLength(1)
    expect(open.filter((r) => r.resolution === "dismissed")).toHaveLength(3)
  })

  it("counts open reports for the sidebar and summary", async () => {
    const summary = await (await summaryRoute(req("/api/admin/summary", MOD))).json()
    expect(summary.reports).toEqual({ locations: 2, reports: 4, maxOnOne: 3 })
    await act(kroger, "dismiss")
    expect((await (await summaryRoute(req("/api/admin/summary", MOD))).json()).reports).toEqual({ locations: 1, reports: 1, maxOnOne: 1 })
  })

  it("refuses a bad action or an unknown location", async () => {
    expect((await act(kroger, "delete")).status).toBe(400)
    expect((await act(randomUUID(), "dismiss")).status).toBe(404)
    expect((await act("nope", "dismiss")).status).toBe(404)
  })
})
