import "server-only"
import { revalidateTag, unstable_cache } from "next/cache"
import { getDb, type Database } from "@/server/db/client"
import { adPlacements } from "@/server/db/schema"
import { SPONSOR_PLACEMENTS, type SponsorPlacement } from "@/config/banners"

export type PlacementFlags = Record<SponsorPlacement, boolean>

/** The cache tag cleared when an admin flips a switch, so the next page load sees it. */
export const AD_PLACEMENTS_TAG = "ad-placements"

/** Which sponsored placements are on (#159). A placement without a row is on. */
export async function readPlacementFlags(db: Database = getDb()): Promise<PlacementFlags> {
  const rows = await db.select({ placement: adPlacements.placement, enabled: adPlacements.enabled }).from(adPlacements)
  const off = new Set(rows.filter((r) => !r.enabled).map((r) => r.placement))
  return Object.fromEntries(SPONSOR_PLACEMENTS.map((p) => [p, !off.has(p)])) as PlacementFlags
}

/** The same, cached on the server until a switch changes (and at most 5 minutes). */
export const getPlacementFlags = unstable_cache(() => readPlacementFlags(), ["ad-placements"], { tags: [AD_PLACEMENTS_TAG], revalidate: 300 })

/** Turns a placement on or off, for everyone, from the next page load. */
export async function setPlacement(placement: SponsorPlacement, enabled: boolean, adminId: string, db: Database = getDb()): Promise<void> {
  await db
    .insert(adPlacements)
    .values({ placement, enabled, updatedBy: adminId })
    .onConflictDoUpdate({ target: adPlacements.placement, set: { enabled, updatedBy: adminId, updatedAt: new Date() } })
  revalidateTag(AD_PLACEMENTS_TAG)
}
