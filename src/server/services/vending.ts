import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { normalizeMachineId } from "@/lib/locations/address"
import { regionAt } from "@/server/geo/regions"
import { SAME_SPOT_METERS, type NewVendingMachine, type OverlapReason, type VendingCandidate, type VendingOverlap } from "@/lib/admin/vending"

/** An overlap, and whether it's a canary (#202): that never leaves this file. */
interface Overlap {
  overlap: VendingOverlap
  canary: boolean
}

/**
 * Every vending machine `c` would duplicate (#154), canaries (#202) included,
 * each with why:
 * - same machine ID (any machine, even hidden or inactive: IDs are unique)
 * - same address in the same state, after normalizing (an active machine)
 * - a pin within `meters` (an active machine)
 * Closest first. Uses the machine ID's unique index, the (state,
 * address_normalized) index and the geography index. The canary planter
 * (scripts/canary/plant.ts) runs the same rules with a wider radius.
 */
async function findOverlaps(c: VendingCandidate, db: Database, meters: number): Promise<Overlap[]> {
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
    canary: boolean
  }>(sql`
    select l.id, l."machineID" as "machineId", coalesce(l.retailer, l.name, '') as retailer, l.address, l.city, l.state,
      coalesce(ST_Distance(l.geog, ${point}), 0)::float8 as meters,
      (l."machineID" = ${machineId}) as "sameId",
      (l.is_active and l.state = ${state} and l.address_normalized = normalize_address(${c.address})) as "sameAddress",
      (l.is_active and ST_DWithin(l.geog, ${point}, ${meters})) as "sameSpot",
      l.is_active as active, l.canary
    from ${locations} l
    where l.kind = 'vending' and (
      l."machineID" = ${machineId}
      or (l.is_active and l.state = ${state} and l.address_normalized = normalize_address(${c.address}))
      or (l.is_active and ST_DWithin(l.geog, ${point}, ${meters}))
    )
    order by meters
    limit 20
  `)
  return rows.map((r) => ({
    canary: r.canary,
    overlap: {
      id: r.id,
      machineId: r.machineId,
      retailer: r.retailer,
      address: r.address ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      meters: Math.round(r.meters),
      reasons: ([r.sameId && "machine_id", r.sameAddress && "address", r.sameSpot && "distance"] as const).filter(Boolean) as OverlapReason[],
      active: r.active,
    },
  }))
}

/**
 * The real machines a new vending machine would duplicate (#154); see
 * findOverlaps. Canaries (#202) aren't listed: they never block a real
 * machine, which takes one over instead (addVendingMachine). `meters` is
 * how close counts as the same spot (80 m for the admin form).
 */
export async function checkVendingOverlap(
  c: VendingCandidate,
  db: Database = getDb(),
  { meters = SAME_SPOT_METERS }: { meters?: number } = {},
): Promise<VendingOverlap[]> {
  return (await findOverlaps(c, db, meters)).filter((o) => !o.canary).map((o) => o.overlap)
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
 *
 * A real machine wins over a canary (#202): when the only overlaps are
 * canaries, the one with the machine ID (else the closest) becomes this
 * machine, as the import does with a canary's ID.
 */
export async function addVendingMachine(input: NewVendingMachine, adminId: string, db: Database = getDb()): Promise<AddResult> {
  const state = input.state.trim().toUpperCase()
  const pin = regionAt(input.lng, input.lat)
  if (pin?.region !== state) return { status: "wrong_state", pinState: pin?.region ?? null }
  return db.transaction(async (tx): Promise<AddResult> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('locations:vending-add'))`)
    const overlaps = await findOverlaps({ ...input, state }, tx as unknown as Database, SAME_SPOT_METERS)
    const real = overlaps.filter((o) => !o.canary)
    if (real.length) return { status: "overlap", overlaps: real.map((o) => o.overlap) }
    const values = {
      kind: "vending" as const,
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
    }
    const canary = (overlaps.find((o) => o.overlap.reasons.includes("machine_id")) ?? overlaps[0])?.overlap
    const [row] = canary
      ? await tx
          .update(locations)
          .set({ ...values, canary: false })
          .where(and(eq(locations.id, canary.id), eq(locations.canary, true)))
          .returning({ id: locations.id })
      : await tx.insert(locations).values(values).returning({ id: locations.id })
    return { status: "added", id: row.id }
  })
}

/**
 * Undo for a machine added by hand (#155): the add was a mistake, so the row
 * is deleted, which frees its machine ID to be entered again. Only manual
 * rows the import hasn't taken over. Whoever undoes it isn't recorded.
 */
export async function undoVendingMachine(id: string, db: Database = getDb()): Promise<boolean> {
  const done = await db
    .delete(locations)
    .where(and(eq(locations.id, id), eq(locations.source, "manual"), eq(locations.kind, "vending")))
    .returning({ id: locations.id })
  return done.length > 0
}
