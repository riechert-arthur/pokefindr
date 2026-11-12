import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import { createMigrator } from "../../scripts/db/migrator"
import { importOsmShops, rollbackRun } from "../../scripts/one-off/import-osm-shops"
import type { OsmShop } from "@/lib/osm/card-shops"
import { testDatabaseUrl } from "./testDatabase"

const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
const { db } = createMigrator(sql)
afterAll(() => sql.end({ timeout: 5 }))

const dir = mkdtempSync(path.join(tmpdir(), "osm-shops-"))
let n = 0
/** Writes a snapshot with these shops and returns its path. */
function snapshot(...shops: OsmShop[]): string {
  const file = path.join(dir, `snapshot-${n++}.json`)
  writeFileSync(file, JSON.stringify({ fetchedAt: "2026-11-12T00:00:00.000Z", shops }))
  return file
}

const shop = (id: number, extra: Partial<OsmShop> = {}): OsmShop => ({
  externalId: `node/${id}`,
  name: `Card Shop ${id}`,
  address: `${id} Broadway`,
  city: "New York",
  state: "NY",
  postalCode: "10001",
  lng: -73.98 + id / 10_000,
  lat: 40.75,
  website: `https://shop${id}.example`,
  hours: "Mo-Su 11:00-19:00",
  tags: { shop: "collector", name: `Card Shop ${id}` },
  ...extra,
})

const run = (file: string) => db.transaction().execute((trx) => importOsmShops(trx, file))
const rows = () =>
  sql<{ external_id: string; name: string; is_active: boolean; website: string | null; hours: string | null; kind: string }[]>`
    select l.external_id, l.name, l.is_active, d.website, d.hours, l.kind
    from locations l left join card_shop_details d on d.location_id = l.id
    where l.source = 'osm' order by l.external_id`

describe("OSM card shop import (npm run db:import-osm-shops, #397)", () => {
  it("inserts shops with their details, logs the run, and writes nothing the second time", async () => {
    const file = snapshot(shop(1), shop(2))
    const first = await run(file)
    expect(first).toMatchObject({ inserted: 2, updated: 0, deactivated: 0, unchanged: 0 })
    expect(first.runId).toBeTruthy()
    expect(await rows()).toEqual([
      { external_id: "node/1", name: "Card Shop 1", is_active: true, website: "https://shop1.example", hours: "Mo-Su 11:00-19:00", kind: "shop" },
      { external_id: "node/2", name: "Card Shop 2", is_active: true, website: "https://shop2.example", hours: "Mo-Su 11:00-19:00", kind: "shop" },
    ])
    expect(await sql`select op from location_import_changes where run_id = ${first.runId}`).toHaveLength(2)

    const second = await run(file)
    expect(second).toMatchObject({ inserted: 0, updated: 0, deactivated: 0, unchanged: 2, runId: null })
    expect(await sql`select id from location_import_runs`).toHaveLength(1)
  })

  it("updates a shop whose OSM data changed, keeps a hidden one hidden, and deactivates one gone from OSM", async () => {
    await run(snapshot(shop(1), shop(2), shop(3)))
    await sql`update locations set hidden_at = now(), is_active = false where external_id = 'node/2'`

    const report = await run(snapshot(shop(1, { name: "Bleecker Trading", website: null }), shop(2, { hours: "Mo-Fr 12:00-20:00" })))
    expect(report).toMatchObject({ inserted: 0, updated: 2, deactivated: 1, hidden: 1, gone: ["node/3"] })
    expect(await rows()).toEqual([
      expect.objectContaining({ external_id: "node/1", name: "Bleecker Trading", website: null, is_active: true }),
      expect.objectContaining({ external_id: "node/2", hours: "Mo-Fr 12:00-20:00", is_active: false }),
      expect.objectContaining({ external_id: "node/3", is_active: false }),
    ])
  })

  it("doesn't insert a shop that's probably already here from another source, and lists it", async () => {
    await sql`
      insert into locations (kind, source, name, geog, is_active)
      values ('shop', 'submission', 'Dave & Adam''s NYC', ST_SetSRID(ST_MakePoint(-73.9877, 40.7505), 4326)::geography, true)`
    const report = await run(
      snapshot(
        shop(10, { name: "Dave & Adam's", lng: -73.9878, lat: 40.7505 }),
        // Same spot, different shop: imported.
        shop(11, { name: "Twenty Sided Store", lng: -73.9878, lat: 40.7505 }),
      ),
    )
    expect(report.duplicates).toEqual([expect.objectContaining({ externalId: "node/10", existingName: "Dave & Adam's NYC" })])
    expect((await rows()).map((r) => r.external_id)).toEqual(["node/11"])
  })

  it("rolls back the latest run: restores updated rows, deletes inserted ones, refuses an older run, and does nothing twice", async () => {
    const first = await run(snapshot(shop(1)))
    const second = await run(snapshot(shop(1, { name: "Renamed" }), shop(2)))

    await expect(db.transaction().execute((trx) => rollbackRun(trx, first.runId!))).rejects.toThrow(/isn't the latest/)

    const undone = await db.transaction().execute((trx) => rollbackRun(trx, second.runId!))
    expect(undone).toMatchObject({ restored: 1, deleted: 1, deactivated: 0, skipped: [] })
    expect(await rows()).toEqual([expect.objectContaining({ external_id: "node/1", name: "Card Shop 1", is_active: true })])

    const again = await db.transaction().execute((trx) => rollbackRun(trx, second.runId!))
    expect(again).toMatchObject({ restored: 0, deleted: 0 })
  })

  it("on rollback, deactivates an inserted shop that's in use since, and skips a row edited since the run", async () => {
    const first = await run(snapshot(shop(1), shop(2)))
    const [used] = await sql<{ id: string }[]>`select id from locations where external_id = 'node/1'`
    await sql`insert into highlights (kind, title, starts_at, location_id) values ('event', 'League night', now() + interval '3 days', ${used.id})`
    await sql`update locations set name = 'Edited by an admin' where external_id = 'node/2'`

    const undone = await db.transaction().execute((trx) => rollbackRun(trx, first.runId!))
    expect(undone).toMatchObject({ deleted: 0, deactivated: 1, skipped: ["node/2"] })
    expect(await rows()).toEqual([
      expect.objectContaining({ external_id: "node/1", is_active: false }),
      expect.objectContaining({ external_id: "node/2", name: "Edited by an admin", is_active: true }),
    ])
  })
})
