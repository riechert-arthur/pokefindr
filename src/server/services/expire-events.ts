import "server-only"
import { sql } from "drizzle-orm"
import { z } from "zod/v3"
import { getDb, type Database } from "@/server/db/client"
import { eventDetails, highlights, locations } from "@/server/db/schema"
import { defineJob } from "@/server/lib/jobs/types"

/**
 * Hides events that are over (#128): event locations whose `event_details`
 * end (or start, plus a day, when there's no end) is past go inactive, so
 * they leave the map, search and counts; event highlights with their own
 * point are unpublished the same way. Rows are kept, with their reviews.
 * Running it twice changes nothing more.
 */
export async function expireEvents(db: Database = getDb(), now = new Date()): Promise<{ locations: number; highlights: number }> {
  const at = sql`${now.toISOString()}::timestamptz`
  const hidden = await db.execute<{ id: string }>(sql`
    update ${locations} l set is_active = false
    from ${eventDetails} e
    where e.location_id = l.id and l.kind = 'event' and l.is_active
      and coalesce(e.ends_at, e.starts_at + interval '1 day') < ${at}
    returning l.id`)
  const unpublished = await db.execute<{ id: string }>(sql`
    update ${highlights} h set is_published = false
    where h.kind = 'event' and h.is_published and h.location_id is null
      and coalesce(h.ends_at, h.starts_at + interval '1 day') < ${at}
    returning h.id`)
  return { locations: hidden.length, highlights: unpublished.length }
}

export const expireEventsJob = defineJob({
  description: "Hides events that have ended",
  schema: z.unknown(),
  async run() {
    return expireEvents()
  },
})
