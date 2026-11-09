import "server-only"
import { sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { normalizeMachineId } from "@/lib/locations/address"
import { SAME_SPOT_METERS, type OverlapReason, type VendingCandidate, type VendingOverlap } from "@/lib/admin/vending"

/**
 * The machines a new vending machine would duplicate (#154), each with why:
 * - same machine ID (any machine, even hidden or inactive: IDs are unique)
 * - same address in the same state, after normalizing (an active machine)
 * - a pin within 80 m (an active machine)
 * Closest first. Uses the machine ID's unique index, the (state,
 * address_normalized) index and the geography index.
 */
export async function checkVendingOverlap(c: VendingCandidate, db: Database = getDb()): Promise<VendingOverlap[]> {
  const point = sql`ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography`
  const machineId = normalizeMachineId(c.machineId)
  const state = c.state.trim().toUpperCase()
  const rows = await db.execute<{
    id: string
    machineId: string | null
    retailer: string
    address: string | null
    city: string | null
    state: string | null
    meters: number
    sameId: boolean
    sameAddress: boolean
    sameSpot: boolean
    active: boolean
  }>(sql`
    select l.id, l."machineID" as "machineId", coalesce(l.retailer, l.name, '') as retailer, l.address, l.city, l.state,
      coalesce(ST_Distance(l.geog, ${point}), 0)::float8 as meters,
      (l."machineID" = ${machineId}) as "sameId",
      (l.is_active and l.state = ${state} and l.address_normalized = normalize_address(${c.address})) as "sameAddress",
      (l.is_active and ST_DWithin(l.geog, ${point}, ${SAME_SPOT_METERS})) as "sameSpot",
      l.is_active as active
    from ${locations} l
    where l.kind = 'vending' and (
      l."machineID" = ${machineId}
      or (l.is_active and l.state = ${state} and l.address_normalized = normalize_address(${c.address}))
      or (l.is_active and ST_DWithin(l.geog, ${point}, ${SAME_SPOT_METERS}))
    )
    order by meters
    limit 20
  `)
  return rows.map((r) => ({
    id: r.id,
    machineId: r.machineId,
    retailer: r.retailer,
    address: r.address ?? "",
    city: r.city ?? "",
    state: r.state ?? "",
    meters: Math.round(r.meters),
    reasons: ([r.sameId && "machine_id", r.sameAddress && "address", r.sameSpot && "distance"] as const).filter(Boolean) as OverlapReason[],
    active: r.active,
  }))
}
