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

import { eq } from "drizzle-orm"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { POST as addRoute } from "@/app/api/admin/vending/route"
import { DELETE as undoRoute } from "@/app/api/admin/vending/[id]/route"
import { getLocationsNear } from "@/server/services/locations"
import { createMigrator } from "../../scripts/db/migrator"
import { loadStaging, mergeStaging, parseFeatures, verifyImport } from "../../scripts/one-off/import-locations"
import { insertProfiles, testDatabaseUrl } from "./testDatabase"

const ADMIN = randomUUID()
const MOD = randomUUID()
const sqlConn = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
const { db: kdb } = createMigrator(sqlConn)
afterAll(() => sqlConn.end({ timeout: 5 }))

beforeEach(async () => {
  enqueued.length = 0
  await insertProfiles(getDb(), [
    { id: ADMIN, username: "misty", role: "admin" },
    { id: MOD, username: "brock", role: "moderator" },
  ])
  await getDb().insert(locations).values({ machineId: "Q00014", retailer: "Fred Meyer", address: "12221 120th Ave NE", city: "Kirkland", state: "WA", geog: { lng: -122.1838, lat: 47.7079 } })
})

const machine = (over: Record<string, unknown> = {}) => ({ retailer: "Safeway", machineId: "q01557", address: "1 New St", city: "Seattle", state: "wa", lat: 47.6, lng: -122.33, ...over })
const add = (body: unknown, userId = ADMIN) => addRoute(new NextRequest("http://localhost/api/admin/vending", { method: "POST", headers: { "x-user-id": userId }, body: JSON.stringify(body) }))
const undo = (id: string, userId = ADMIN) => undoRoute(new NextRequest(`http://localhost/api/admin/vending/${id}`, { method: "DELETE", headers: { "x-user-id": userId } }), { params: Promise.resolve({ id }) })
const near = async () => (await getLocationsNear({ center: [-122.33, 47.6], radiusMiles: 2, types: ["vending"] })).features.map((f) => f.properties.id)

describe("POST /api/admin/vending", () => {
  it("adds a manual machine that shows on the map right away", async () => {
    const res = await add(machine())
    expect(res.status).toBe(201)
    const { id } = await res.json()
    const [row] = await getDb().select().from(locations).where(eq(locations.id, id))
    expect(row).toMatchObject({ kind: "vending", machineId: "Q01557", state: "WA", source: "manual", createdBy: ADMIN, isActive: true, isOfficial: false, addressNormalized: "1 new st" })
    expect(await near()).toContain(id)
    expect(enqueued).toEqual(["refresh-region-counts"])
  })

  it("refuses an overlap with 409 and the matches, even called directly", async () => {
    const res = await add(machine({ machineId: "Q01558", address: "12221 120th Avenue Northeast", city: "Kirkland", lat: 47.70793, lng: -122.1838 }))
    expect(res.status).toBe(409)
    expect((await res.json()).overlaps).toMatchObject([{ machineId: "Q00014", reasons: ["address", "distance"] }])
    expect(await getDb().select().from(locations)).toHaveLength(1)
  })

  it("lets only one of two identical adds through", async () => {
    const results = await Promise.all([add(machine()), add(machine())])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
  })

  it("checks the fields and that the pin is in the state", async () => {
    expect((await add(machine({ machineId: "Q123" }))).status).toBe(400)
    const wrong = await add(machine({ state: "OR" }))
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toMatchObject({ error: "The pin is in WA, not OR.", field: "pin" })
  })

  it("is for admins only", async () => {
    expect((await add(machine(), MOD)).status).toBe(404)
  })
})

describe("DELETE /api/admin/vending/:id (Undo)", () => {
  it("takes a machine added here off the map, and only those", async () => {
    const { id } = await (await add(machine())).json()
    expect((await undo(id)).status).toBe(200)
    expect(await near()).not.toContain(id)
    const [row] = await getDb().select().from(locations).where(eq(locations.id, id))
    expect(row).toMatchObject({ isActive: false, hiddenBy: ADMIN })
    // Already undone, and an official machine can't be undone.
    expect((await undo(id)).status).toBe(404)
    const [official] = await getDb().select().from(locations).where(eq(locations.machineId, "Q00014"))
    expect((await undo(official.id)).status).toBe(404)
  })
})

describe("the location import and manual machines", () => {
  const importFile = (features: object[]) =>
    kdb.transaction().execute(async (trx) => {
      await loadStaging(trx, parseFeatures({ features }).rows)
      await mergeStaging(trx)
      return verifyImport(trx)
    })
  const feature = (machineID: string, lng: number, lat: number) => ({ geometry: { type: "Point", coordinates: [lng, lat] }, properties: { machineID, retailer: "Safeway", address: "1 New St", city: "Seattle", state: "WA" } })

  it("keeps a manual machine the list doesn't have, and takes one over once the list has its machine ID", async () => {
    const { id } = await (await add(machine())).json()
    const first = await importFile([feature("Q00014", -122.1838, 47.7079)])
    expect(first.extras).toEqual(["Q01557"])
    expect((await getDb().select().from(locations).where(eq(locations.id, id)))[0]).toMatchObject({ isActive: true, source: "manual" })
    await importFile([feature("Q00014", -122.1838, 47.7079), feature("Q01557", -122.3301, 47.6001)])
    const [row] = await getDb().select().from(locations).where(eq(locations.machineId, "Q01557"))
    expect(row.id).toBe(id)
    expect(row.source).not.toBe("manual")
  })
})
