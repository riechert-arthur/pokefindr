/**
 * Adds the canary locations (#202) generated from CANARY_SEED (decoys.ts) to
 * `locations`, or lists them. See docs/database.md.
 *
 *   npm run canary:plant                  # add or update them (6 by default)
 *   npm run canary:plant -- --count 8
 *   npm run canary:plant -- --list        # print them, to search a copied dataset; no database needed
 *   npm run canary:plant -- --prune       # also delete canaries this seed and count don't make
 *
 * Safe to run again: rows are matched on "machineID", and only canary rows
 * are ever written. All in one transaction; nothing is written if a decoy
 * would sit on a real place (same machine ID or address, or within 250 m).
 */
import type postgres from "postgres"
import { loadDevEnv, migrationClient } from "../db/env"
import { generateCanaries, type Canary } from "./decoys"

export const DEFAULT_COUNT = 6
/** How close a decoy may come to a real location. */
export const CLEARANCE_METERS = 250

export interface PlantResult {
  added: number
  updated: number
  unchanged: number
  /** Canary rows this set doesn't include (another seed or a larger count): kept, unless pruned. */
  stale: string[]
  pruned: number
}

/** Upserts `canaries` as inactive canary rows, in one transaction. Throws, writing nothing, when one would clash with a real location. */
export async function plantCanaries(sql: postgres.Sql, canaries: Canary[], { prune = false } = {}): Promise<PlantResult> {
  return sql.begin(async (tx) => {
    const clashes = await tx<{ machineID: string; with: string }[]>`
      select c."machineID", coalesce(l."machineID", l.name, l.retailer, l.id::text) || ' (' || coalesce(l.address, '') || ', ' || coalesce(l.city, '') || ')' as with
      from jsonb_to_recordset(${tx.json(canaries)}) as c("machineID" text, address text, state text, lng float8, lat float8)
      join locations l on not l.canary and (
        l."machineID" = c."machineID"
        or (l.state = c.state and l.address_normalized = normalize_address(c.address))
        or ST_DWithin(l.geog, ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography, ${CLEARANCE_METERS})
      )
      order by 1`
    if (clashes.length) {
      throw new Error(`Decoys clash with real locations, so nothing was written (try another seed):\n${clashes.map((c) => `  ${c.machineID}: ${c.with}`).join("\n")}`)
    }
    const changed = await tx<{ inserted: boolean }[]>`
      insert into locations ("machineID", retailer, address, city, state, country_code, kind, geog, is_active, canary, source)
      select c."machineID", c.retailer, c.address, c.city, c.state, 'US', 'vending',
        ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography, false, true, 'canary'
      from jsonb_to_recordset(${tx.json(canaries)}) as c("machineID" text, retailer text, address text, city text, state text, lng float8, lat float8)
      on conflict ("machineID") do update
        set retailer = excluded.retailer, address = excluded.address, city = excluded.city, state = excluded.state, geog = excluded.geog
        where locations.canary
          and (locations.retailer, locations.address, locations.city, locations.state, ST_AsEWKB(locations.geog::geometry))
            is distinct from (excluded.retailer, excluded.address, excluded.city, excluded.state, ST_AsEWKB(excluded.geog::geometry))
      returning (xmax = 0) as inserted`
    const ids = canaries.map((c) => c.machineID)
    const stale = (await tx<{ machineID: string }[]>`
      select "machineID" from locations where canary and "machineID" not in ${tx(ids)} order by 1`).map((r) => r.machineID)
    const pruned = prune && stale.length ? (await tx`delete from locations where canary and "machineID" in ${tx(stale)}`).count : 0
    const added = changed.filter((r) => r.inserted).length
    return { added, updated: changed.length - added, unchanged: canaries.length - changed.length, stale, pruned }
  })
}

function parseArgs(argv: string[]) {
  const countAt = argv.indexOf("--count")
  const count = countAt === -1 ? DEFAULT_COUNT : Number(argv[countAt + 1])
  return { count, list: argv.includes("--list"), prune: argv.includes("--prune") }
}

async function main() {
  loadDevEnv()
  const { count, list, prune } = parseArgs(process.argv.slice(2))
  const canaries = generateCanaries(process.env.CANARY_SEED ?? "", count)
  if (list) {
    console.log(["machineID", "retailer", "address", "city", "state", "lat", "lng"].join("\t"))
    for (const c of canaries) console.log([c.machineID, c.retailer, c.address, c.city, c.state, c.lat, c.lng].join("\t"))
    return
  }
  const sql = migrationClient()
  try {
    const r = await plantCanaries(sql, canaries, { prune })
    console.log(`Canaries: ${r.added} added, ${r.updated} updated, ${r.unchanged} unchanged.`)
    if (r.pruned) console.log(`Deleted ${r.pruned} other canaries: ${r.stale.join(", ")}.`)
    else if (r.stale.length) console.log(`${r.stale.length} other canaries kept (--prune deletes them): ${r.stale.join(", ")}.`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

// Run only as a script, not when a test imports this file.
if (process.argv[1]?.endsWith("plant.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
