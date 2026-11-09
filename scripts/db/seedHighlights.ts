import type postgres from "postgres"

/** Invented events for local development, from the prototype; dated from today, so they stay upcoming. */
export const SAMPLE_EVENTS = [
  { title: "Card show", city: "Denver", state: "CO", lng: -104.99, lat: 39.74, inDays: 6, lastsDays: 0 },
  { title: "League challenge", city: "Dallas", state: "TX", lng: -96.8, lat: 32.78, inDays: 13, lastsDays: 0 },
  { title: "Restock weekend", city: "Sacramento", state: "CA", lng: -121.49, lat: 38.58, inDays: 18, lastsDays: 2 },
] as const

/** `locations.source` of the sample events' places. */
export const SAMPLE_SOURCE = "sample"

/** The place's name: the list and details panel show it, so it says it isn't real. */
export const sampleEventName = (title: string) => `${title} (sample)`

/**
 * Seeds the sample events, each as an event location (so searching its city
 * finds it, and its details open) with a highlight at it (its marker and its
 * row in "Across the US").
 *
 * The locations are kept and updated by name, so their ids, and reviews made
 * on them, survive re-seeding; one no longer in SAMPLE_EVENTS is hidden. The
 * highlights (`is_sample` rows only; real ones are never touched) are
 * replaced by a fresh set dated from `now`, so they stay upcoming. In one
 * transaction: never a partial set. Returns how many it added.
 */
export async function seedSampleHighlights(sql: postgres.Sql, now = new Date()): Promise<number> {
  const day = 24 * 60 * 60 * 1000
  // 18:00 UTC: the same calendar day across US time zones.
  const evening = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 18)
  await sql.begin(async (tx) => {
    await tx`delete from highlights where is_sample`
    const names = SAMPLE_EVENTS.map((e) => sampleEventName(e.title))
    await tx`
      update locations set is_active = false
      where source = ${SAMPLE_SOURCE} and kind = 'event' and is_active and name not in ${tx(names)}`
    for (const e of SAMPLE_EVENTS) {
      const name = sampleEventName(e.title)
      const [found] = await tx<{ id: string }[]>`
        update locations set city = ${e.city}, state = ${e.state}, geog = st_setsrid(st_makepoint(${e.lng}, ${e.lat}), 4326)::geography, is_active = true
        where source = ${SAMPLE_SOURCE} and kind = 'event' and name = ${name}
        returning id`
      const [place] = found
        ? [found]
        : await tx<{ id: string }[]>`
            insert into locations (kind, name, city, state, country_code, geog, source)
            values ('event', ${name}, ${e.city}, ${e.state}, 'US', st_setsrid(st_makepoint(${e.lng}, ${e.lat}), 4326)::geography, ${SAMPLE_SOURCE})
            returning id`
      const starts = new Date(evening + e.inDays * day)
      const ends = e.lastsDays ? new Date(starts.getTime() + e.lastsDays * day) : null
      await tx`
        insert into highlights (kind, title, starts_at, ends_at, location_id, is_sample)
        values ('event', ${e.title}, ${starts}, ${ends}, ${place.id}, true)`
      // An event location's times live in event_details (migration 0011), which upcoming events read first.
      await tx`
        insert into event_details (location_id, starts_at, ends_at)
        values (${place.id}, ${starts}, ${ends})
        on conflict (location_id) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at`
    }
  })
  return SAMPLE_EVENTS.length
}
