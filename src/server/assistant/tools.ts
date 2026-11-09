import "server-only"
import { z } from "zod/v3"
import { zodToJsonSchema } from "zod-to-json-schema"
import type { Database } from "@/server/db/client"
import type { Geocoder } from "@/server/ports/geocoder"
import { getLocationFeature, getLocationsNear } from "@/server/services/locations"
import { getAreaStats, getLocationsInState, matchRetailers, sampleIds, type Area } from "@/server/services/areas"
import { getUpcomingEvents } from "@/server/services/highlights"
import { getPanelReviews } from "@/server/services/reviews"
import { KINDS } from "@/components/pokefindr/kinds"
import { STATES } from "@/lib/map/states"
import { milesBetween } from "@/lib/map/geo"
import { LOCATION_KINDS, type LocationFeature, type LocationKind } from "@/lib/types/locations"
import type { AssistantCard, AssistantEvent, AssistantPlace } from "@/lib/types/assistant"
import type { PlaceBudget } from "./limits"
import { USER_WRITTEN_NOTE, plainUserText } from "./untrusted"

/**
 * The assistant's tools, shared by the in-app assistant (/api/assistant) and
 * the MCP server: one implementation, read-only, over the location
 * services. Each returns a small `data` object for the model and, where
 * the page shows one, a `card` for the viewer. Results are capped (at most
 * MAX_PLACES places a call, counts but no lists for big areas), so no tool
 * pages through the data set.
 */

/** Most places one call returns. */
export const MAX_PLACES = 10
/** Most stops a route orders. */
export const MAX_STOPS = 9
export const MAX_RADIUS_MILES = 50
/** Events are few and people travel for them: a wider circle. */
export const MAX_EVENT_RADIUS_MILES = 250

export interface ToolContext {
  db: Database
  geocoder: Geocoder
  /** The viewer's shared location, already rounded (~1 km); null when not shared. */
  viewer: { lng: number; lat: number } | null
  now: Date
  signal?: AbortSignal
  /** The viewer's places left today (#211); none means no cap (the MCP server sets its own). */
  places?: PlaceBudget
}

export interface ToolOutput {
  /** What the model reads. */
  data: Record<string, unknown>
  /** What the viewer sees, when the tool shows something. */
  card?: AssistantCard
}

/** A problem with the input the model can fix ("no match for X"): sent back as a tool error, not a server error. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ToolInputError"
  }
}

export interface AssistantTool<I extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string
  description: string
  input: I
  run(input: z.infer<I>, ctx: ToolContext): Promise<ToolOutput>
}

const tool = <I extends z.ZodTypeAny>(t: AssistantTool<I>) => t

// ── Areas ──────────────────────────────────────────────

type Where =
  | { kind: "point"; lng: number; lat: number; label: string }
  | { kind: "state"; code: string; label: string; asked: string }

const ME = /^(me|my location|near me|here|current location|around me)$/i
const STATE_NAMES = new Map(Object.entries(STATES).map(([code, s]) => [s.name.toLowerCase(), code]))

/** Where "near" points: the viewer, a state, or a geocoded US place. */
export async function resolveWhere(text: string, ctx: ToolContext): Promise<Where> {
  const q = text.trim()
  if (!q) throw new ToolInputError("Say where: a US city, a state, or 'me'.")
  // "ME" in capitals is Maine's code; "me" (any other case) is the viewer.
  if (ME.test(q) && q !== "ME") {
    if (!ctx.viewer) throw new ToolInputError("The viewer hasn't shared a location. Ask for a city, or ask them to use the map's location button.")
    return { kind: "point", lng: ctx.viewer.lng, lat: ctx.viewer.lat, label: "you" }
  }
  const code = STATE_NAMES.get(q.toLowerCase()) ?? (q.length === 2 && STATES[q.toUpperCase()] ? q.toUpperCase() : null)
  if (code) return { kind: "state", code, label: STATES[code].name, asked: q }
  const [hit] = await ctx.geocoder.search(q, { limit: 1, signal: ctx.signal, near: ctx.viewer ? [ctx.viewer.lng, ctx.viewer.lat] : undefined })
  if (!hit) throw new ToolInputError(`No US place matches "${q}". Try a city with its state, like "Portland, OR".`)
  if (hit.kind === "state" && hit.state && STATES[hit.state]) return { kind: "state", code: hit.state, label: STATES[hit.state].name, asked: q }
  return { kind: "point", lng: hit.lng, lat: hit.lat, label: hit.label }
}

/** How to read a whole-state answer: "LA" or "New York" means the state, so say so, in case a city was meant. */
function stateNote(w: Extract<Where, { kind: "state" }>, radiusGiven: boolean): string {
  const read = `"${w.asked}" was read as the whole state of ${w.label}${radiusGiven ? ", so the radius was ignored" : ""}.`
  return `${read} If a city was meant, search it with its state, like "Los Angeles, CA" or "New York, NY".`
}

/** The state answer's notes, joined, or nothing for a point. */
const notesFor = (w: Where, radiusGiven: boolean, ...more: (string | false | undefined)[]) => {
  const notes = [w.kind === "state" ? stateNote(w, radiusGiven) : undefined, ...more].filter(Boolean)
  return notes.length ? { note: notes.join(" ") } : {}
}

const areaOf = (w: Where, radiusMiles: number): Area => (w.kind === "state" ? { state: w.code } : { center: [w.lng, w.lat], radiusMiles })

/**
 * Keeps the places the viewer may still see today: ones already shown are
 * free, each new one uses up the budget. Throws when none are left, so the
 * answer points to the map instead.
 */
export function allowPlaces<T extends { id: string }>(places: readonly T[], ctx: ToolContext): T[] {
  const budget = ctx.places
  if (!budget || places.length === 0) return [...places]
  const kept = places.filter((p) => {
    if (budget.seen.has(p.id)) return true
    if (budget.left <= 0) return false
    budget.left--
    budget.seen.add(p.id)
    budget.added.push(p.id)
    return true
  })
  if (kept.length === 0) throw new ToolInputError("The viewer has seen today's limit of places from the assistant. Tell them the map shows every place, and the limit resets at midnight UTC.")
  return kept
}

// ── Shapes ─────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10

function placeOf(f: LocationFeature, samples: Set<string>, miles?: number): AssistantPlace {
  const p = f.properties
  const [lng, lat] = f.geometry.coordinates
  return {
    id: p.id,
    // Shops and events come from submissions (R4), so every text field is someone's typing.
    name: plainUserText(p.retailer, 100) || "Unnamed place",
    kind: p.kind ?? "vending",
    address: plainUserText(p.address, 160),
    city: plainUserText(p.city, 60),
    state: plainUserText(p.state, 4),
    lng,
    lat,
    ...(miles === undefined ? {} : { miles: round1(miles) }),
    ...(samples.has(p.id) ? { sample: true as const } : {}),
  }
}

/** The model's view of a place: no coordinates, the kind spelled out. */
const brief = (p: AssistantPlace) => ({
  id: p.id,
  name: p.name,
  type: KINDS[p.kind].one,
  address: p.address,
  city: p.city,
  state: p.state,
  ...(p.miles === undefined ? {} : { miles: p.miles }),
  ...(p.sample ? { sample_data: true } : {}),
})

const kindsInput = z
  .array(z.enum(LOCATION_KINDS))
  .optional()
  .describe("Kinds of place; all when omitted. 'vending' is vending machines, 'shop' card shops, 'event' events.")
const kindsOf = (v: readonly LocationKind[] | undefined): LocationKind[] => (v?.length ? [...new Set(v)] : [...LOCATION_KINDS])

// ── Tools ──────────────────────────────────────────────

export const findPlaces = tool({
  name: "find_places",
  description:
    "Search PokeFindr locations near a US city or address, in a whole state, or near the viewer ('me'). Returns the total and up to 10 places with ids, names and addresses: near a place, the closest first with straight-line miles; in a state, a few by city (not by distance). A state name or two-letter code means the whole state; for a city that shares a state's name, add the state ('New York, NY'). The page shows the places to the viewer as a card.",
  input: z.object({
    near: z.string().min(1).max(120).describe("A US city with its state like 'Portland, OR', an address, a state name or code (the whole state), or 'me'"),
    radius_miles: z.number().min(1).max(MAX_RADIUS_MILES).optional().describe("1–50, default 10. Ignored for a state."),
    types: kindsInput,
    retailer: z.string().max(60).optional().describe("Vending retailer name, e.g. 'Safeway'. Only vending machines match."),
    limit: z.number().int().min(1).max(MAX_PLACES).optional().describe("Places to return, default 8, at most 10"),
  }),
  async run(input, ctx) {
    const where = await resolveWhere(input.near, ctx)
    const radiusMiles = input.radius_miles ?? 10
    const limit = input.limit ?? 8
    let types = kindsOf(input.types)
    let retailers: string[] = []
    if (input.retailer) {
      retailers = await matchRetailers(input.retailer, ctx.db)
      if (retailers.length === 0) throw new ToolInputError(`No vending retailer matches "${input.retailer}".`)
      types = ["vending"]
    }
    const { features, total, miles } =
      where.kind === "state"
        ? { ...(await getLocationsInState({ state: where.code, types, retailers, limit }, ctx.db)), miles: null }
        : await getLocationsNear({ center: [where.lng, where.lat], radiusMiles, types, retailers, limit }, ctx.db).then((r) => ({
            features: r.features as LocationFeature[],
            total: r.total,
            miles: r.features.map((f) => f.properties.distance),
          }))
    const samples = await sampleIds(features.map((f) => f.properties.id), ctx.db)
    const places = allowPlaces(features.map((f, i) => placeOf(f, samples, miles?.[i])), ctx)
    const title = where.kind === "state" ? `${total.toLocaleString("en-US")} in ${where.label}` : `${total.toLocaleString("en-US")} within ${radiusMiles} mi of ${where.label}`
    return {
      data: {
        area: where.label,
        radius_miles: where.kind === "state" ? null : radiusMiles,
        ...(retailers.length ? { retailers } : {}),
        total,
        showing: places.length,
        places: places.map(brief),
        ...notesFor(
          where,
          input.radius_miles !== undefined,
          total > places.length && (where.kind === "state" ? "These are a few of the state's places by city, not the closest. The map shows the rest." : "Only the closest are listed. The map shows the rest."),
        ),
      },
      card: { type: "places", title, places, total, near: where.kind === "point" ? { lng: where.lng, lat: where.lat, label: where.label, radiusMiles } : null },
    }
  },
})

export const areaStats = tool({
  name: "area_stats",
  description:
    "Counts for an area: totals by kind, the top vending retailers and the top cities. Use for 'how many' or 'which retailer' questions. Returns counts only, never a list of places. A state name or two-letter code means the whole state.",
  input: z.object({
    area: z.string().min(1).max(120).describe("A US city with its state, a state name or code (the whole state), or 'me'"),
    radius_miles: z.number().min(1).max(MAX_RADIUS_MILES).optional().describe("For a city or 'me': 1–50, default 15"),
  }),
  async run(input, ctx) {
    const where = await resolveWhere(input.area, ctx)
    const radiusMiles = input.radius_miles ?? 15
    const stats = await getAreaStats(areaOf(where, radiusMiles), LOCATION_KINDS, ctx.db)
    const byType = Object.fromEntries(LOCATION_KINDS.map((k) => [KINDS[k].many, stats.byKind[k] ?? 0]))
    const title = where.kind === "state" ? where.label : `Within ${radiusMiles} mi of ${where.label}`
    return {
      data: {
        area: where.label,
        radius_miles: where.kind === "state" ? null : radiusMiles,
        total: stats.total,
        by_type: byType,
        top_retailers: stats.topRetailers.map((r) => ({ retailer: plainUserText(r.retailer, 100), machines: r.count })),
        top_cities: stats.topCities.map((c) => ({ city: plainUserText(c.city, 60), state: plainUserText(c.state, 4), locations: c.count })),
        ...notesFor(where, input.radius_miles !== undefined),
      },
      card: { type: "stats", title, total: stats.total, byKind: stats.byKind, topRetailers: stats.topRetailers.map((r) => ({ ...r, retailer: plainUserText(r.retailer, 100) })) },
    }
  },
})

/** Google Maps driving directions from `origin` through the stops. */
export function directionsUrl(origin: { lng: number; lat: number }, stops: readonly { lng: number; lat: number }[]): string {
  const ll = (p: { lng: number; lat: number }) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
  const url = new URL("https://www.google.com/maps/dir/")
  url.searchParams.set("api", "1")
  url.searchParams.set("origin", ll(origin))
  url.searchParams.set("destination", ll(stops[stops.length - 1]))
  const mids = stops.slice(0, -1).filter((p) => p !== origin)
  if (mids.length) url.searchParams.set("waypoints", mids.map(ll).join("|"))
  url.searchParams.set("travelmode", "driving")
  return url.toString()
}

/** Nearest-first order from `start` (or the first stop): short enough for 9 stops. */
export function nearestFirst<T extends { lng: number; lat: number }>(stops: readonly T[], start: { lng: number; lat: number } | null) {
  const left = [...stops]
  const order: T[] = []
  const legs: number[] = []
  let cur: { lng: number; lat: number }
  if (start) cur = start
  else {
    cur = left.shift()!
    order.push(cur as T)
    legs.push(0)
  }
  while (left.length) {
    let best = 0
    let bestMiles = Infinity
    left.forEach((p, i) => {
      const d = milesBetween(cur.lng, cur.lat, p.lng, p.lat)
      if (d < bestMiles) [best, bestMiles] = [i, d]
    })
    const next = left.splice(best, 1)[0]
    order.push(next)
    legs.push(bestMiles)
    cur = next
  }
  return { order, legs, total: legs.reduce((a, b) => a + b, 0) }
}

export const planRoute = tool({
  name: "plan_route",
  description:
    "Order 2–9 places (ids from find_places) into an efficient visiting order, nearest first. Returns the stops, leg and total straight-line miles, and a Google Maps directions link. The page shows a route card and can draw it on the map.",
  input: z.object({
    place_ids: z.array(z.string().max(64)).min(2).max(MAX_STOPS).describe("Place ids from find_places"),
    start: z.string().max(120).optional().describe("Optional start: 'me' or a US city or address"),
  }),
  async run(input, ctx) {
    const ids = [...new Set(input.place_ids)]
    const found = (await Promise.all(ids.map((id) => getLocationFeature(id, ctx.db)))).filter((f): f is LocationFeature => f !== null)
    if (found.length < 2) throw new ToolInputError("Pass at least two place ids that find_places returned.")
    let start: { lng: number; lat: number; label: string } | null = null
    if (input.start) {
      const w = await resolveWhere(input.start, ctx)
      if (w.kind === "state") throw new ToolInputError("Start at a city, an address or 'me', not a whole state.")
      start = w
    }
    const samples = await sampleIds(found.map((f) => f.properties.id), ctx.db)
    const { order, legs, total } = nearestFirst(allowPlaces(found.map((f) => placeOf(f, samples)), ctx), start)
    const mapsUrl = directionsUrl(start ?? order[0], order)
    return {
      data: {
        start: start ? start.label : order[0].name,
        stops: order.map((p, i) => ({ order: i + 1, ...brief(p), leg_miles: round1(legs[i]) })),
        total_miles: round1(total),
        note: "Straight-line distances; driving is longer.",
        maps_url: mapsUrl,
        ...(found.length < ids.length ? { skipped: ids.length - found.length } : {}),
      },
      card: { type: "route", stops: order, legs: legs.map(round1), totalMiles: round1(total), mapsUrl, start },
    }
  },
})

export const listEvents = tool({
  name: "list_events",
  description:
    "List upcoming events (card shows, league nights, restocks): soonest first anywhere or in a state, or nearest first within a radius of a US city or 'me'. The total counts the events in that area only.",
  input: z.object({
    near: z.string().max(120).optional().describe("A US city with its state, a state name or code (the whole state), or 'me'; omit for the soonest anywhere"),
    radius_miles: z.number().min(1).max(MAX_EVENT_RADIUS_MILES).optional().describe(`Around a city or 'me': 1–${MAX_EVENT_RADIUS_MILES}, default 100`),
    limit: z.number().int().min(1).max(MAX_PLACES).optional().describe("Default 5, at most 10"),
  }),
  async run(input, ctx) {
    const where = input.near ? await resolveWhere(input.near, ctx) : null
    const limit = input.limit ?? 5
    // Few events exist; fetch the upcoming ones and narrow here.
    let events: AssistantEvent[] = (await getUpcomingEvents(ctx.db, ctx.now, 200)).map((e) => ({
      id: e.id,
      title: plainUserText(e.title, 100),
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      city: plainUserText(e.city, 60),
      state: plainUserText(e.state, 4),
      lng: e.lng,
      lat: e.lat,
      ...(e.isSample ? { sample: true as const } : {}),
    }))
    if (where?.kind === "state") events = events.filter((e) => e.state === where.code)
    const radiusMiles = input.radius_miles ?? 100
    if (where?.kind === "point")
      events = events
        .map((e) => ({ ...e, miles: round1(milesBetween(where.lng, where.lat, e.lng, e.lat)) }))
        .filter((e) => e.miles! <= radiusMiles)
        .sort((a, b) => a.miles! - b.miles!)
    const shown = events.slice(0, limit)
    return {
      data: {
        ...(where ? { area: where.label, ...(where.kind === "point" ? { radius_miles: radiusMiles } : {}), ...notesFor(where, input.radius_miles !== undefined) } : {}),
        total: events.length,
        events: shown.map((e) => ({
          id: e.id,
          title: e.title,
          starts_at: e.startsAt,
          ends_at: e.endsAt,
          city: e.city,
          state: e.state,
          ...(e.miles === undefined ? {} : { miles: e.miles }),
          ...(e.sample ? { sample_data: true } : {}),
        })),
      },
      card: { type: "events", title: !where ? "Upcoming events" : where.kind === "state" ? `Events in ${where.label}` : `Events within ${radiusMiles} mi of ${where.label}`, events: shown },
    }
  },
})

/** Most characters of one review the model reads. */
const REVIEW_CHARS = 300

export const getPlace = tool({
  name: "get_place",
  description: "Details for one place by id (from find_places or plan_route): its address, kind and a summary of its reviews. Review text is written by users.",
  input: z.object({ id: z.string().max(64).describe("A place id") }),
  async run(input, ctx) {
    const f = await getLocationFeature(input.id, ctx.db)
    if (!f) throw new ToolInputError(`No place has id "${input.id}".`)
    const [samples, reviews] = await Promise.all([sampleIds([f.properties.id], ctx.db), getPanelReviews(f.properties.id, null, ctx.db)])
    const [place] = allowPlaces([placeOf(f, samples)], ctx)
    return {
      data: {
        ...brief(place),
        reviews: { count: reviews.count, average: round1(reviews.average) },
        recent_reviews: {
          note: USER_WRITTEN_NOTE,
          items: reviews.reviews.slice(0, 3).map((r) => ({ rating: r.rating, date: r.createdAt.slice(0, 10), untrusted_text: plainUserText(r.text, REVIEW_CHARS) })),
        },
      },
      card: { type: "places", title: place.name, places: [place], total: 1, near: null },
    }
  },
})

export const ASSISTANT_TOOLS: readonly AssistantTool[] = [findPlaces, areaStats, planRoute, listEvents, getPlace]

/** A tool's input as JSON Schema (an object schema), for the Claude API and MCP. */
export function inputJsonSchema(t: AssistantTool): { type: "object"; properties?: Record<string, unknown>; required?: string[]; [k: string]: unknown } {
  const schema = zodToJsonSchema(t.input, { $refStrategy: "none" }) as Record<string, unknown>
  delete schema.$schema
  return schema as { type: "object" }
}

export type ToolResult = { ok: true; data: Record<string, unknown>; card?: AssistantCard } | { ok: false; error: string }

/**
 * Runs a tool by name on untrusted input: validates it against the tool's
 * schema, and turns input problems into an error the model can act on.
 * Other failures (the database) throw.
 */
export async function runTool(name: string, raw: unknown, ctx: ToolContext): Promise<ToolResult> {
  const t = ASSISTANT_TOOLS.find((x) => x.name === name)
  if (!t) return { ok: false, error: `Unknown tool "${name}".` }
  const parsed = t.input.safeParse(raw)
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}` }
  try {
    const out = await t.run(parsed.data, ctx)
    return { ok: true, ...out }
  } catch (err) {
    if (err instanceof ToolInputError) return { ok: false, error: err.message }
    throw err
  }
}
