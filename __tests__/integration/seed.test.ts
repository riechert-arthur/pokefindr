import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { readSeedLocations, seedLocations } from "../../scripts/db/seedLocations"
import { SAMPLE_EVENTS, seedSampleHighlights } from "../../scripts/db/seedHighlights"
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

describe("seedSampleHighlights", () => {
  it("replaces the sample events with upcoming ones, labelled as samples, and leaves real ones alone", async () => {
    await seedSampleHighlights(sql, new Date("2026-01-01T15:00:00Z"))
    await sql`insert into highlights (kind, title, starts_at, geog, is_sample) values ('event', 'Real show', '2026-01-10T18:00:00Z', st_setsrid(st_makepoint(0, 0), 4326)::geography, false)`
    const now = new Date("2026-11-07T15:00:00Z")
    expect(await seedSampleHighlights(sql, now)).toBe(SAMPLE_EVENTS.length)
    expect((await sql`select title from highlights where not is_sample`).map((r) => r.title)).toEqual(["Real show"])
    const rows = await sql<{ title: string; starts_at: Date; is_sample: boolean }[]>`select title, starts_at, is_sample from highlights where is_sample order by starts_at`
    expect(rows.map((r) => r.title)).toEqual(["Card show", "League challenge", "Restock weekend"])
    expect(rows.every((r) => r.is_sample && r.starts_at > now)).toBe(true)
  })
})
