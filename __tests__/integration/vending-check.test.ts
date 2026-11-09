import { beforeEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { NextRequest } from "next/server"
import { sql } from "drizzle-orm"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { POST as checkRoute } from "@/app/api/admin/vending/check/route"
import { checkVendingOverlap } from "@/server/services/vending"
import { normalizeAddress } from "@/lib/locations/address"
import { insertProfiles } from "./testDatabase"

const ADMIN = randomUUID()
const MOD = randomUUID()

beforeEach(async () => {
  await insertProfiles(getDb(), [
    { id: ADMIN, username: "misty", role: "admin" },
    { id: MOD, username: "brock", role: "moderator" },
  ])
  await getDb()
    .insert(locations)
    .values([
      // Kirkland: two machines at one store, as in the official list.
      { machineId: "Q00014", retailer: "Fred Meyer", address: "12221 120th Ave NE", city: "Kirkland", state: "WA", geog: { lng: -122.1838, lat: 47.7079 } },
      { machineId: "Q00238", retailer: "Fred Meyer", address: "12221 120th Ave NE", city: "Kirkland", state: "WA", geog: { lng: -122.1838, lat: 47.7079 } },
      { machineId: "Q00500", retailer: "Safeway", address: "1 Elsewhere Rd", city: "Seattle", state: "WA", geog: { lng: -122.33, lat: 47.6 } },
      { machineId: "Q00777", retailer: "Gone", address: "9 Old Rd", city: "Seattle", state: "WA", geog: { lng: -122.4, lat: 47.6 }, isActive: false },
    ])
})

const candidate = (over: Record<string, unknown> = {}) => ({ machineId: "Q01557", address: "12221 120th Avenue Northeast", state: "WA", lat: 47.70793, lng: -122.1838, ...over })

describe("checkVendingOverlap", () => {
  it("finds the same address written differently and the same spot, with each reason", async () => {
    const overlaps = await checkVendingOverlap(candidate())
    expect(overlaps.map((o) => [o.machineId, o.reasons])).toEqual([
      ["Q00014", ["address", "distance"]],
      ["Q00238", ["address", "distance"]],
    ])
    expect(overlaps[0].meters).toBeLessThan(80)
  })

  it("finds the same machine ID anywhere, even an inactive machine", async () => {
    expect((await checkVendingOverlap(candidate({ machineId: "q00500 ", address: "5 Other St", lat: 40, lng: -100 }))).map((o) => [o.machineId, o.reasons])).toEqual([["Q00500", ["machine_id"]]])
    expect((await checkVendingOverlap(candidate({ machineId: "Q00777", address: "5 Other St", lat: 40, lng: -100 }))).map((o) => [o.machineId, o.active])).toEqual([["Q00777", false]])
  })

  it("finds a pin within 80 m (260 ft) but not one farther", async () => {
    // ~70 m north, another address.
    expect((await checkVendingOverlap(candidate({ address: "1 New St", lat: 47.70853 }))).map((o) => o.reasons)).toEqual([["distance"], ["distance"]])
    // ~110 m north.
    expect(await checkVendingOverlap(candidate({ address: "1 New St", lat: 47.70889 }))).toEqual([])
  })

  it("needs the same state for the same address", async () => {
    expect(await checkVendingOverlap(candidate({ state: "OR", lat: 45.5, lng: -122.6 }))).toEqual([])
  })

  it("ignores an inactive machine's address and spot", async () => {
    expect(await checkVendingOverlap(candidate({ address: "9 Old Rd", lat: 47.6, lng: -122.4 }))).toEqual([])
  })

  it("answers in under 100 ms", async () => {
    await checkVendingOverlap(candidate())
    const t = performance.now()
    await checkVendingOverlap(candidate())
    expect(performance.now() - t).toBeLessThan(100)
  })
})

describe("normalize_address() in Postgres", () => {
  it("agrees with normalizeAddress() on every address in the official list, and on the tricky ones", async () => {
    const file = JSON.parse(readFileSync(path.resolve(__dirname, "../../src/data/vending_machines_mod.json"), "utf8")) as { features: { properties: { address?: string } }[] }
    const samples = [
      ...new Set([
        ...file.features.map((f) => f.properties.address ?? ""),
        "12221 120th Avenue Northeast",
        "12221 120th Ave. N.E.",
        "  1450   GRANT ST., Suite #2 ",
        "10 Eastgate Courtland Rd",
        "",
      ]),
    ]
    const rows = await getDb().execute<{ a: string; n: string | null }>(sql`select a, normalize_address(a) as n from jsonb_array_elements_text(${JSON.stringify(samples)}::jsonb) as a`)
    const mismatches = rows.filter((r) => r.n !== normalizeAddress(r.a))
    expect(mismatches).toEqual([])
    expect(rows.length).toBeGreaterThan(1000)
  })
})

describe("POST /api/admin/vending/check", () => {
  const post = (userId: string, body: unknown) => checkRoute(new NextRequest("http://localhost/api/admin/vending/check", { method: "POST", headers: { "x-user-id": userId }, body: JSON.stringify(body) }))

  it("is for admins only, and answers the overlaps", async () => {
    expect((await post(MOD, candidate())).status).toBe(404)
    const res = await post(ADMIN, candidate())
    expect(res.status).toBe(200)
    expect((await res.json()).overlaps).toHaveLength(2)
    expect((await post(ADMIN, { machineId: "Q1" })).status).toBe(400)
  })
})
