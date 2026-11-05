import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { readSeedLocations, seedLocations } from "../../scripts/db/seedLocations"
import { testDatabaseUrl } from "./testDatabase"

const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

describe("seedLocations", () => {
  const rows = readSeedLocations()

  it("has fixture rows with unique machine IDs", () => {
    expect(rows.length).toBeGreaterThan(0)
    expect(new Set(rows.map((r) => r.machineID)).size).toBe(rows.length)
  })

  it("inserts once, then changes nothing", async () => {
    expect(await seedLocations(sql, rows)).toEqual({ added: rows.length, updated: 0, unchanged: 0 })
    expect(await seedLocations(sql, rows)).toEqual({ added: 0, updated: 0, unchanged: rows.length })

    const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from locations`
    expect(count).toBe(rows.length)
  })

  it("updates a row whose fixture values changed and stores the point", async () => {
    await seedLocations(sql, rows)
    const moved = { ...rows[0], name: "Renamed", longitude: -100, latitude: 40 }

    expect(await seedLocations(sql, [moved])).toEqual({ added: 0, updated: 1, unchanged: 0 })

    const [row] = await sql<{ name: string; lng: number; lat: number }[]>`
      select name, st_x(geog::geometry) as lng, st_y(geog::geometry) as lat
      from locations where "machineID" = ${moved.machineID}`
    expect(row).toEqual({ name: "Renamed", lng: -100, lat: 40 })
  })
})
