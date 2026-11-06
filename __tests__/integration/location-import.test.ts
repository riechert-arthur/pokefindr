import path from "node:path"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import { parseFeatures, readFeatureFile, type LocationRow, type SourceFeature } from "../../scripts/db/locations/features"
import { loadStaging, mergeStaging, verifyImport } from "../../scripts/db/locations/merge"
import { testDatabaseUrl } from "./testDatabase"

const JSON_FILE = path.resolve(__dirname, "../../src/data/vending_machines_mod.json")
const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
afterAll(() => sql.end({ timeout: 5 }))

const feature = (machineID: string, lng: number, lat: number, extra: Record<string, unknown> = {}): SourceFeature => ({
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: { machineID, retailer: "Frys", address: `${machineID} Main St`, city: "Phoenix", state: "AZ", ...extra },
})

const rows = (...features: SourceFeature[]): LocationRow[] => parseFeatures({ features }).rows

async function importRows(input: LocationRow[]) {
  return sql.begin(async (tx) => {
    await loadStaging(tx, input)
    const counts = await mergeStaging(tx)
    return { counts, verify: await verifyImport(tx) }
  })
}

const machine = async (machineID: string) => {
  const [r] = await sql<{ lng: number; lat: number; is_active: boolean; manual_override: boolean }[]>`
    select ST_X(geog::geometry) as lng, ST_Y(geog::geometry) as lat, is_active, manual_override
    from locations where "machineID" = ${machineID}`
  return r
}

describe("db:import-locations", () => {
  it("imports every machine in the JSON, verifies it, and writes nothing the second time", async () => {
    const source = readFeatureFile(JSON_FILE)
    expect(source.skipped).toEqual([])

    const first = await importRows(source.rows)
    expect(first.counts).toMatchObject({ inserted: source.total, updated: 0 })
    expect(first.verify.problems).toEqual([])
    expect(first.verify.overridesFlagged).toBe(source.rows.filter((r) => r.manual_override).length)

    const before = await sql`select "machineID", updated_at from locations order by 1`
    const second = await importRows(source.rows)
    expect(second.counts).toMatchObject({ inserted: 0, updated: 0, unchanged: source.total })
    expect(await sql`select "machineID", updated_at from locations order by 1`).toEqual(before)
  })

  it("updates a machine whose details changed in the file", async () => {
    await importRows(rows(feature("Q1", -112, 33)))
    const { counts } = await importRows(rows(feature("Q1", -112.1, 33.1)))
    expect(counts).toMatchObject({ inserted: 0, updated: 1 })
    expect(await machine("Q1")).toMatchObject({ lng: -112.1, lat: 33.1 })
  })

  it("keeps a database override unless the file overrides it too", async () => {
    await importRows(rows(feature("Q1", -112, 33)))
    await sql`update locations set manual_override = true, geog = 'SRID=4326;POINT(-112.5 33.5)' where "machineID" = 'Q1'`

    const plain = await importRows(rows(feature("Q1", -112, 33)))
    expect(plain.counts).toMatchObject({ updated: 0, keptOverrides: 1 })
    expect(plain.verify.problems).toEqual([])
    expect(await machine("Q1")).toMatchObject({ lng: -112.5, lat: 33.5 })

    await importRows(rows(feature("Q1", -113, 34, { _manual_override: true })))
    expect(await machine("Q1")).toMatchObject({ lng: -113, lat: 34, manual_override: true })
  })

  it("lists machines that aren't in the file without touching them", async () => {
    await importRows(rows(feature("Q1", -112, 33), feature("Q2", -112, 33)))
    const { verify } = await importRows(rows(feature("Q1", -112, 33)))
    expect(verify.extras).toEqual(["Q2"])
    expect(await machine("Q2")).toMatchObject({ is_active: true })
  })
})
