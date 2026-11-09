import "server-only"
import { sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { eventDetails, highlights, locations } from "@/server/db/schema"
import { milesBetween } from "@/lib/map/geo"
import type { Highlights, Hotspot, UpcomingEvent } from "@/lib/types/highlights"
import { HOTSPOT_RADIUS_MILES } from "@/lib/highlights/constants"
import { METERS_PER_MILE, cityName, preferredSpelling } from "./locations"

/** A hotspot counts the vending machines this many miles around a city. */
export const HOTSPOT_RADIUS = HOTSPOT_RADIUS_MILES
/** Hotspots are at least this far apart, so one metro area shows once. */
export const HOTSPOT_SPACING = 50
/** Only cities with this many machines of their own are named: "Los Angeles", not a suburb that happens to sit in the middle. */
export const HOTSPOT_MIN_OWN = 5
/** How many hotspots the US view shows. */
export const HOTSPOT_LIMIT = 4
/** How many upcoming events it shows. */
export const EVENT_LIMIT = 3

/**
 * The cities with the most vending machines within 15 mi, as in the
 * prototype, among cities with at least 5 of their own (so a hotspot has a
 * name people know). Each city sits at the middle of its machines; a city within
 * 50 mi of a busier hotspot is skipped, so Portland's suburbs (or Tacoma's,
 * next to Seattle's) don't fill the list.
 */
export async function getHotspots(db: Database = getDb(), limit = HOTSPOT_LIMIT): Promise<Hotspot[]> {
  // Named and grouped as the state sheet's cities are (getTopCities).
  const name = cityName(sql`l.city`)
  const rows = await db.execute<Hotspot>(sql`
    with cities as (
      select l.state,
        ${preferredSpelling(name)} as city,
        avg(ST_X(l.geog::geometry)) as lng, avg(ST_Y(l.geog::geometry)) as lat
      from ${locations} l
      where l.is_active and l.geog is not null and l.kind = 'vending' and l.country_code = 'US'
        and ${name} <> '' and coalesce(l.state, '') <> ''
      group by l.state, lower(${name})
      having count(*) >= ${HOTSPOT_MIN_OWN}
    )
    select c.city, c.state, round(c.lng::numeric, 4)::float8 as lng, round(c.lat::numeric, 4)::float8 as lat,
      (select count(*)::int from ${locations} l
        where l.is_active and l.kind = 'vending' and l.country_code = 'US'
          and ST_DWithin(l.geog, ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography, ${HOTSPOT_RADIUS * METERS_PER_MILE}, false)
      ) as count
    from cities c
    order by count desc, city
    limit ${limit * 25}
  `)
  const picked: Hotspot[] = []
  for (const c of rows) {
    if (picked.length === limit) break
    if (picked.every((p) => milesBetween(p.lng, p.lat, c.lng, c.lat) > HOTSPOT_SPACING)) picked.push(c)
  }
  return picked
}

/**
 * Events that haven't ended, soonest first: published event highlights, at
 * their location or their own point, and approved event locations (#123)
 * that no highlight features. An event's times come from `event_details`
 * when it has a location there; a highlight with its own point keeps its own.
 * An event without an end lasts a day, so a card show stays listed while it runs.
 */
export async function getUpcomingEvents(db: Database = getDb(), now = new Date(), limit = EVENT_LIMIT): Promise<UpcomingEvent[]> {
  const at = sql`${now.toISOString()}::timestamptz`
  const rows = await db.execute<UpcomingEvent>(sql`
    select * from (
      select h.id, h.title,
        coalesce(e.starts_at, h.starts_at) as "startsAt",
        case when e.location_id is not null then e.ends_at else h.ends_at end as "endsAt",
        coalesce(h.city, l.city, '') as city, coalesce(h.state, l.state, '') as state,
        round(ST_X(coalesce(h.geog, l.geog)::geometry)::numeric, 4)::float8 as lng,
        round(ST_Y(coalesce(h.geog, l.geog)::geometry)::numeric, 4)::float8 as lat,
        h.is_sample as "isSample"
      from ${highlights} h
      left join ${locations} l on l.id = h.location_id
      left join ${eventDetails} e on e.location_id = h.location_id
      where h.kind = 'event' and h.is_published and coalesce(h.geog, l.geog) is not null
        and case when e.location_id is not null then coalesce(e.ends_at, e.starts_at + interval '1 day')
          else coalesce(h.ends_at, h.starts_at + interval '1 day') end > ${at}
      union all
      select l.id, coalesce(l.name, ''), e.starts_at, e.ends_at, coalesce(l.city, ''), coalesce(l.state, ''),
        round(ST_X(l.geog::geometry)::numeric, 4)::float8, round(ST_Y(l.geog::geometry)::numeric, 4)::float8,
        false
      from ${locations} l
      join ${eventDetails} e on e.location_id = l.id
      where l.is_active and l.geog is not null
        and coalesce(e.ends_at, e.starts_at + interval '1 day') > ${at}
        and not exists (select 1 from ${highlights} h where h.location_id = l.id and h.kind = 'event' and h.is_published)
    ) events
    order by "startsAt", id
    limit ${limit}
  `)
  return rows.map((r) => ({ ...r, startsAt: new Date(r.startsAt).toISOString(), endsAt: r.endsAt && new Date(r.endsAt).toISOString() }))
}

const CACHE_MS = 10 * 60 * 1000
let cached: { at: number; value: Promise<Highlights> } | undefined

/**
 * Hotspots and upcoming events for the US view. Kept for 10 minutes per
 * server instance (the CDN keeps the response as long), so the hotspot
 * query runs rarely.
 */
export function getHighlights(now = Date.now()): Promise<Highlights> {
  if (cached && now - cached.at < CACHE_MS) return cached.value
  const value = Promise.all([getHotspots(), getUpcomingEvents()]).then(([hotspots, events]) => ({ hotspots, events }))
  cached = { at: now, value }
  value.catch(() => {
    if (cached?.value === value) cached = undefined
  })
  return value
}

/** Test helper: forget the cached highlights. */
export function resetHighlightsCacheForTests() {
  cached = undefined
}
