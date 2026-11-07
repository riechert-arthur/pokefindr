import type postgres from "postgres"

/** Invented events for local development, from the prototype; dated from today, so they stay upcoming. */
export const SAMPLE_EVENTS = [
  { title: "Card show", city: "Denver", state: "CO", lng: -104.99, lat: 39.74, inDays: 6, lastsDays: 0 },
  { title: "League challenge", city: "Dallas", state: "TX", lng: -96.8, lat: 32.78, inDays: 13, lastsDays: 0 },
  { title: "Restock weekend", city: "Sacramento", state: "CA", lng: -121.49, lat: 38.58, inDays: 18, lastsDays: 2 },
] as const

/**
 * Adds the sample events, labelled `is_sample`, unless sample highlights are
 * already there (it never touches real ones). Returns how many it added.
 */
export async function seedSampleHighlights(sql: postgres.Sql, now = new Date()): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from highlights where is_sample`
  if (n > 0) return 0
  const day = 24 * 60 * 60 * 1000
  // Noon UTC, so the date reads the same across US time zones.
  const noon = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 18)
  for (const e of SAMPLE_EVENTS) {
    const starts = new Date(noon + e.inDays * day)
    const ends = e.lastsDays ? new Date(starts.getTime() + e.lastsDays * day) : null
    await sql`
      insert into highlights (kind, title, starts_at, ends_at, geog, city, state, is_sample)
      values ('event', ${e.title}, ${starts}, ${ends}, st_setsrid(st_makepoint(${e.lng}, ${e.lat}), 4326)::geography, ${e.city}, ${e.state}, true)`
  }
  return SAMPLE_EVENTS.length
}
