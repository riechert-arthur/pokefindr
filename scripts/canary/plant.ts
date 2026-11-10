/**
 * Plants the canary locations (#202): made-up vending machines, active and
 * shown like any other place, so a copy of PokeFindr's data can be
 * recognized. See docs/database.md. The database is the only record of
 * them: rows with `locations.canary` set.
 *
 *   npm run canary:plant                  # make sure there are 6, adding only what's missing
 *   npm run canary:plant -- --count 8
 *   npm run canary:plant -- --list        # print them (from the database), to search a copied dataset for
 *   npm run canary:plant -- --remove      # delete them all
 *
 * Each runs in one transaction. A decoy never lands within 250 m of a real
 * location, nor on its machine ID or address (checkVendingOverlap's rules).
 */
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import type { Database } from "@/server/db/client"
import * as schema from "@/server/db/schema"
import { locations } from "@/server/db/schema"
import { checkVendingOverlap } from "@/server/services/vending"
import { regionAt } from "@/server/geo/regions"
import type { VendingOverlap } from "@/lib/admin/vending"
import { loadDevEnv, migrationClient } from "../db/env"
import { cryptoRandomInt, makeDecoy, unusedMachineNumbers, type Canary, type Group, type RandomInt } from "./decoys"

export const DEFAULT_COUNT = 6
/** The most decoys: a few are enough to recognize a copy. */
export const MAX_CANARIES = 32
/** How close a decoy may come to a real location. */
export const CLEARANCE_METERS = 250
/** Draws per missing decoy before giving up. */
const TRIES = 50

/** The canaries in the database, by machine ID. */
export async function listCanaries(db: Database): Promise<Canary[]> {
  return db.execute<Canary>(sql`
    select "machineID", coalesce(retailer, name, '') as retailer, coalesce(address, '') as address,
      coalesce(city, '') as city, coalesce(state, '') as state,
      ST_X(geog::geometry)::float8 as lng, ST_Y(geog::geometry)::float8 as lat
    from ${locations} where canary order by "machineID"`)
}

/** Deletes every canary; returns how many. */
export async function removeCanaries(db: Database): Promise<number> {
  return (await db.delete(locations).where(sql`${locations.canary}`).returning({ id: locations.id })).length
}

/** The real locations `c` would sit on: the admin form's duplicate rules, with a 250 m radius. */
export const canaryClashes = (db: Database, c: Canary): Promise<VendingOverlap[]> =>
  checkVendingOverlap({ machineId: c.machineID, address: c.address, state: c.state, lat: c.lat, lng: c.lng }, db, { meters: CLEARANCE_METERS })

/** Retailers in towns with at least two active machines of theirs, at the middle of them, and none with a canary yet. */
async function groups(db: Database): Promise<Group[]> {
  return db.execute<Group>(sql`
    with real as (
      select coalesce(retailer, name) as retailer, city, state, geog
      from ${locations}
      where is_active and not canary and kind = 'vending' and country_code = 'US' and geog is not null
        and coalesce(retailer, name, '') <> '' and coalesce(city, '') <> '' and coalesce(state, '') <> ''
    )
    select retailer, city, state,
      ST_X(ST_Centroid(ST_Collect(geog::geometry)))::float8 as lng, ST_Y(ST_Centroid(ST_Collect(geog::geometry)))::float8 as lat
    from real r
    where not exists (
      select 1 from ${locations} c
      where c.canary and coalesce(c.retailer, c.name) = r.retailer and lower(c.city) = lower(r.city) and c.state = r.state
    )
    group by retailer, city, state
    having count(*) >= 2
    order by retailer, city, state`)
}

export interface PlantResult {
  added: Canary[]
  /** Canaries in the database afterwards. */
  total: number
}

/**
 * Makes sure there are `count` canaries, adding only what's missing, each
 * for its own retailer and town, with an unused machine ID among the real
 * ones. One transaction, under the admin add's lock, so a machine added at
 * the same time can't clash.
 */
export async function plantCanaries(db: Database, count = DEFAULT_COUNT, rand: RandomInt = cryptoRandomInt): Promise<PlantResult> {
  if (!Number.isInteger(count) || count < 1 || count > MAX_CANARIES) throw new Error(`The count must be 1 to ${MAX_CANARIES}`)
  return db.transaction(async (trx) => {
    const tx = trx as unknown as Database
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('locations:vending-add'))`)
    const have = (await listCanaries(tx)).length
    const added: Canary[] = []
    if (have >= count) return { added, total: have }
    const towns = await groups(tx)
    const used = await tx.execute<{ machineID: string }>(sql`select "machineID" from ${locations} where "machineID" is not null`)
    const numbers = unusedMachineNumbers(used.map((r) => r.machineID))
    const missing = count - have
    for (let tries = 0; added.length < missing; tries++) {
      if (tries >= missing * TRIES || !towns.length || !numbers.length) {
        const left = missing - added.length
        throw new Error(`Couldn't place ${left} more ${left === 1 ? "canary" : "canaries"} clear of the real locations, so nothing was written`)
      }
      const town = rand(towns.length)
      const number = rand(numbers.length)
      const decoy = makeDecoy(towns[town], numbers[number], rand)
      if (regionAt(decoy.lng, decoy.lat)?.region !== decoy.state) continue
      if ((await canaryClashes(tx, decoy)).length) continue
      // Clear of the other canaries too.
      const [near] = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from ${locations}
        where canary and ST_DWithin(geog, ST_SetSRID(ST_MakePoint(${decoy.lng}, ${decoy.lat}), 4326)::geography, ${CLEARANCE_METERS})`)
      if (near.n) continue
      await tx.insert(locations).values({
        kind: "vending",
        machineId: decoy.machineID,
        retailer: decoy.retailer,
        address: decoy.address,
        city: decoy.city,
        state: decoy.state,
        countryCode: "US",
        geog: { lng: decoy.lng, lat: decoy.lat },
        isActive: true,
        canary: true,
        source: "canary",
      })
      added.push(decoy)
      towns.splice(town, 1)
      numbers.splice(number, 1)
    }
    return { added, total: have + added.length }
  })
}

const COLUMNS = ["machineID", "retailer", "address", "city", "state", "lat", "lng"] as const
const tsv = (canaries: Canary[]) => [COLUMNS.join("\t"), ...canaries.map((c) => COLUMNS.map((k) => c[k]).join("\t"))].join("\n")

function parseArgs(argv: string[]) {
  const countAt = argv.indexOf("--count")
  const count = countAt === -1 ? DEFAULT_COUNT : Number(argv[countAt + 1])
  return { count, list: argv.includes("--list"), remove: argv.includes("--remove") }
}

const canaries = (n: number) => `${n} ${n === 1 ? "canary" : "canaries"}`

async function main() {
  loadDevEnv()
  const { count, list, remove } = parseArgs(process.argv.slice(2))
  const client = migrationClient()
  const db = drizzle(client, { schema })
  try {
    if (list) {
      console.log(tsv(await listCanaries(db)))
    } else if (remove) {
      console.log(`Deleted ${canaries(await removeCanaries(db))}.`)
    } else {
      const { added, total } = await plantCanaries(db, count)
      console.log(added.length ? `Added ${canaries(added.length)}, ${total} in all. --list prints them.` : `There are already ${canaries(total)}; nothing added.`)
    }
  } finally {
    await client.end({ timeout: 5 })
  }
}

// Run only as a script, not when a test imports this file.
if (process.argv[1]?.endsWith("plant.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
