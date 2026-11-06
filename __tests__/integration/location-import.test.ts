import path from "node:path"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import { sql as k } from "kysely"
import { createMigrator } from "../../scripts/db/migrator"
import {
  importLocations,
  loadStaging,
  mergeStaging,
  parseFeatures,
  readFeatureFile,
  verifyImport,
  type LocationRow,
  type SourceFeature,
} from "../../scripts/one-off/import-locations"
import { testDatabaseUrl } from "./testDatabase"

const JSON_FILE = path.resolve(__dirname, "../../src/data/vending_machines_mod.json")
const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
const { db } = createMigrator(sql)
afterAll(() => sql.end({ timeout: 5 }))

const feature = (machineID: string, lng: number, lat: number, extra: Record<string, unknown> = {}): SourceFeature => ({
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: { machineID, retailer: "Frys", address: `${machineID} Main St`, city: "Phoenix", state: "AZ", ...extra },
})

const rows = (...features: SourceFeature[]): LocationRow[] => parseFeatures({ features }).rows

async function importRows(input: LocationRow[]) {
  return db.transaction().execute(async (trx) => {
    await loadStaging(trx, input)
    const counts = await mergeStaging(trx)
    return { counts, verify: await verifyImport(trx) }
  })
}

const machine = async (machineID: string) => {
  const [r] = await sql<{ lng: number; lat: number; is_active: boolean; manual_override: boolean; manual_override_source: string | null }[]>`
    select ST_X(geog::geometry) as lng, ST_Y(geog::geometry) as lat, is_active, manual_override, manual_override_source
    from locations where "machineID" = ${machineID}`
  return r
}

describe("location import (npm run db:import-locations)", () => {
  it("imports every machine in the JSON, verifies it, and writes nothing the second time", async () => {
    const source = readFeatureFile(JSON_FILE)
    expect(source.skipped).toEqual([])
    // The ETL's staging rows must survive the import.
    await sql`insert into locations_staging ("machineID") values ('ETL-1')`

    const first = await db.transaction().execute((trx) => importLocations(trx))
    expect(first.counts).toMatchObject({ inserted: source.rows.length, updated: 0 })
    expect(first.verify.problems).toEqual([])
    expect(first.verify.overridesFlagged).toBe(source.rows.filter((r) => r.manual_override).length)

    const before = await sql`select "machineID", updated_at from locations order by 1`
    const second = await db.transaction().execute((trx) => importLocations(trx))
    expect(second.counts).toMatchObject({ inserted: 0, updated: 0, unchanged: source.rows.length })
    expect(await sql`select "machineID", updated_at from locations order by 1`).toEqual(before)

    expect(await sql`select "machineID" from locations_staging`).toEqual([{ machineID: "ETL-1" }])
    // The temporary table went away with the transaction.
    expect(await sql`select to_regclass('location_import') as t`).toEqual([{ t: null }])
  })

  it("never drops a permanent table named like its temporary one", async () => {
    await sql`create table public.location_import (keep int)`
    try {
      await importRows(rows(feature("Q1", -112, 33)))
      expect(await sql`select to_regclass('public.location_import') as t`).toEqual([{ t: "location_import" }])
    } finally {
      await sql`drop table public.location_import`
    }
  })

  it("keeps updated_at current for writers other than the import", async () => {
    // Inserts keep the given value; only updates fire the trigger.
    await sql`insert into locations ("machineID", updated_at) values ('Q1', '2000-01-01')`
    await sql`update locations set name = 'Renamed by hand' where "machineID" = 'Q1'`
    const [after] = await sql<{ updated_at: Date }[]>`select updated_at from locations where "machineID" = 'Q1'`
    expect(after.updated_at.getFullYear()).toBeGreaterThan(2000)
  })

  it("refuses to load outside a transaction, where the temporary table wouldn't last", async () => {
    await expect(loadStaging(db, [])).rejects.toThrow("needs a transaction")
  })

  it("verification catches a merge that lost an override, and the transaction writes nothing", async () => {
    await expect(
      db.transaction().execute(async (trx) => {
        await loadStaging(trx, rows(feature("Q1", -112, 33, { _manual_override: true })))
        await mergeStaging(trx)
        await k`update locations set manual_override = false`.execute(trx) // as if the merge had a bug
        throw new Error((await verifyImport(trx)).problems.join("; "))
      }),
    ).rejects.toThrow("1 manual overrides in the file, but 0 are flagged.")
    expect(await machine("Q1")).toBeUndefined()
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
    expect(await machine("Q1")).toMatchObject({ lng: -113, lat: 34, manual_override: true, manual_override_source: "file" })
  })

  it("only counts kept overrides whose values differ from the file", async () => {
    await importRows(rows(feature("Q1", -112, 33)))
    await sql`update locations set manual_override = true where "machineID" = 'Q1'`
    const { counts } = await importRows(rows(feature("Q1", -112, 33)))
    expect(counts).toMatchObject({ updated: 0, unchanged: 1, keptOverrides: 0 })
  })

  it("clears an override the file set once the file drops the flag", async () => {
    await importRows(rows(feature("Q1", -112, 33, { _manual_override: true })))
    const { counts, verify } = await importRows(rows(feature("Q1", -113, 34)))
    expect(counts).toMatchObject({ updated: 1, keptOverrides: 0 })
    expect(verify.problems).toEqual([])
    expect(await machine("Q1")).toMatchObject({ lng: -113, lat: 34, manual_override: false, manual_override_source: null })
  })

  it("accepts a database override that keeps a machine inactive", async () => {
    await importRows(rows(feature("Q1", -112, 33)))
    await sql`update locations set manual_override = true, is_active = false where "machineID" = 'Q1'`
    const { counts, verify } = await importRows(rows(feature("Q1", -112, 33)))
    expect(counts).toMatchObject({ updated: 0, keptOverrides: 1 })
    expect(verify.problems).toEqual([])
    expect(await machine("Q1")).toMatchObject({ is_active: false, manual_override: true })
  })

  it("reports a machine left inactive that isn't a kept override", async () => {
    await expect(
      db.transaction().execute(async (trx) => {
        await loadStaging(trx, rows(feature("Q1", -112, 33)))
        await mergeStaging(trx)
        await k`update locations set is_active = false`.execute(trx) // as if the merge had a bug
        throw new Error((await verifyImport(trx)).problems.join("; "))
      }),
    ).rejects.toThrow("1 machines from the file aren't active with a position: Q1")
  })

  it("lists machines that aren't in the file without touching them", async () => {
    await importRows(rows(feature("Q1", -112, 33), feature("Q2", -112, 33)))
    const { verify } = await importRows(rows(feature("Q1", -112, 33)))
    expect(verify.extras).toEqual(["Q2"])
    expect(await machine("Q2")).toMatchObject({ is_active: true })
  })
})
