import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { normalizeMachineId } from "@/lib/locations/address"
import { regionAt } from "@/server/geo/regions"
import { SAME_SPOT_METERS, type NewVendingMachine, type OverlapReason, type VendingCandidate, type VendingOverlap } from "@/lib/admin/vending"

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

export type AddResult =
  | { status: "added"; id: string }
  | { status: "overlap"; overlaps: VendingOverlap[] }
  | { status: "wrong_state"; pinState: string | null }

/**
 * Adds a vending machine missing from the official list (#155). The
 * overlap check runs again inside the insert's transaction, one add at a
 * time (an advisory lock), so two admins can't add the same machine at
 * once, and the API refuses an overlap however it's called. The pin must be
 * in the state given. The row is `source = 'manual'` with `created_by`;
 * the location import leaves it alone, and takes it over if the official
 * list later has the same machine ID.
 */
export async function addVendingMachine(input: NewVendingMachine, adminId: string, db: Database = getDb()): Promise<AddResult> {
  const state = input.state.trim().toUpperCase()
  const pin = regionAt(input.lng, input.lat)
  if (pin?.region !== state) return { status: "wrong_state", pinState: pin?.region ?? null }
  return db.transaction(async (tx): Promise<AddResult> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('locations:vending-add'))`)
    const overlaps = await checkVendingOverlap({ ...input, state }, tx as unknown as Database)
    if (overlaps.length) return { status: "overlap", overlaps }
    const [row] = await tx
      .insert(locations)
      .values({
        kind: "vending",
        machineId: normalizeMachineId(input.machineId),
        retailer: input.retailer.trim(),
        address: input.address.trim(),
        city: input.city.trim(),
        state,
        countryCode: "US",
        geog: { lng: input.lng, lat: input.lat },
        source: "manual",
        isOfficial: false,
        isActive: true,
        createdBy: adminId,
      })
      .returning({ id: locations.id })
    return { status: "added", id: row.id }
  })
}

/**
 * Undo for a machine added by hand (#155): a soft delete (off the map, like a
 * hidden location), so its history stays. Only manual rows.
 */
export async function undoVendingMachine(id: string, adminId: string, db: Database = getDb()): Promise<boolean> {
  const done = await db
    .update(locations)
    .set({ isActive: false, hiddenAt: new Date(), hiddenBy: adminId, updatedAt: new Date() })
    .where(and(eq(locations.id, id), eq(locations.source, "manual"), eq(locations.kind, "vending"), eq(locations.isActive, true)))
    .returning({ id: locations.id })
  return done.length > 0
}
