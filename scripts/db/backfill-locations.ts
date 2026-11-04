/**
 * One-off: copies retailer/address/city/state/postcode from the bundled map
 * data (src/data/vending_machines_mod.json) into `locations`, matched on
 * "machineID". Machines missing from the table are inserted.
 *
 *   npm run db:backfill-locations              # dry run: prints what would change
 *   npm run db:backfill-locations -- --apply   # writes
 *
 * Safe to re-run. Existing coordinates, names and descriptions are never
 * overwritten (existing reviews are matched to locations by position).
 */
import path from "node:path"
import { readFileSync } from "node:fs"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { inArray, sql } from "drizzle-orm"
import { loadEnvConfig } from "@next/env"
import { locations } from "../../src/server/db/schema"

loadEnvConfig(path.resolve(__dirname, "../.."))

const SOURCE = path.resolve(__dirname, "../../src/data/vending_machines_mod.json")
const BATCH_SIZE = 200

interface SourceFeature {
  geometry?: { coordinates?: [number, number] }
  properties: {
    machineID?: string
    retailer?: string
    address?: string
    city?: string
    state?: string
    name?: string
    full_address?: string
    place_formatted?: string
    coordinates?: { longitude?: number; latitude?: number }
    context?: { postcode?: { name?: string } }
  }
}

export interface LocationRow {
  machineId: string
  retailer: string | null
  address: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  name: string | null
  description: string | null
  lng: number
  lat: number
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

/** Same coordinate preference as scripts/push_supabase.py: geocoded first, then geometry. */
export function toLocationRow(feature: SourceFeature): LocationRow | null {
  const p = feature.properties ?? {}
  const machineId = clean(p.machineID)
  if (!machineId) return null

  let lng = p.coordinates?.longitude
  let lat = p.coordinates?.latitude
  if (!isNum(lng) || !isNum(lat)) {
    ;[lng, lat] = feature.geometry?.coordinates ?? []
  }
  if (!isNum(lng) || !isNum(lat)) return null

  return {
    machineId,
    retailer: clean(p.retailer),
    address: clean(p.address),
    city: clean(p.city),
    state: clean(p.state),
    postalCode: clean(p.context?.postcode?.name),
    name: clean(p.name) ?? clean(p.address),
    description: clean(p.full_address) ?? clean(p.place_formatted),
    lng,
    lat,
  }
}

async function main() {
  const apply = process.argv.includes("--apply")
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED)")

  const source = JSON.parse(readFileSync(SOURCE, "utf8")) as { features: SourceFeature[] }
  const rows = source.features.map(toLocationRow).filter((r): r is LocationRow => r !== null)
  console.log(`Source: ${source.features.length} features, ${rows.length} usable (machineID + coordinates).`)

  const client = postgres(url, { max: 1, prepare: false })
  const db = drizzle(client)
  try {
    const existing = new Set<string>()
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const ids = rows.slice(i, i + BATCH_SIZE).map((r) => r.machineId)
      const found = await db
        .select({ machineId: locations.machineId })
        .from(locations)
        .where(inArray(locations.machineId, ids))
      found.forEach((f) => f.machineId && existing.add(f.machineId))
    }
    const toInsert = rows.filter((r) => !existing.has(r.machineId)).length
    console.log(`Would update details on ${existing.size} existing locations and insert ${toInsert} new ones.`)

    if (!apply) {
      console.log("Dry run. Re-run with --apply to write.")
      return
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      await db
        .insert(locations)
        .values(
          batch.map((r) => ({
            machineId: r.machineId,
            retailer: r.retailer,
            address: r.address,
            city: r.city,
            state: r.state,
            postalCode: r.postalCode,
            name: r.name,
            description: r.description,
            geog: { lng: r.lng, lat: r.lat },
            isOfficial: true,
          })),
        )
        .onConflictDoUpdate({
          target: locations.machineId,
          set: {
            retailer: sql`excluded.retailer`,
            address: sql`excluded.address`,
            city: sql`excluded.city`,
            state: sql`excluded.state`,
            postalCode: sql`excluded.postal_code`,
            name: sql`coalesce(${locations.name}, excluded.name)`,
            description: sql`coalesce(${locations.description}, excluded.description)`,
            geog: sql`coalesce(${locations.geog}, excluded.geog)`,
            updatedAt: sql`now()`,
          },
        })
      console.log(`  wrote ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`)
    }
    console.log("Done.")
  } finally {
    await client.end({ timeout: 5 })
  }
}

// Run only when executed directly (tests import toLocationRow).
if (typeof require !== "undefined" && require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
