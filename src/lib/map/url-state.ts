/**
 * The map's state in the URL, so every view can be shared (#105). Shared by
 * the /map page (server) and the map (client, through nuqs).
 *
 *   /map?q=Seattle%2C+WA&lat=47.6062&lng=-122.3321&r=10   a place and radius
 *   /map?near=me&r=10                                     around the viewer (never coordinates)
 *   /map?state=WA                                         a state
 *   /map?lat=47.61&lng=-122.33&z=11.5                     a camera the viewer moved to
 *   /map?location=<uuid>                                  a location's details
 *   &types=vending,shop                                   kinds shown (omitted when all)
 *   &retailer=Safeway,QFC                                 vending retailers (omitted when all)
 */
import {
  createLoader,
  createSerializer,
  parseAsArrayOf,
  parseAsFloat,
  parseAsNumberLiteral,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from "nuqs/server"
import { LOCATION_KINDS } from "@/lib/types/locations"
import type { UpcomingEvent } from "@/lib/types/highlights"
import { placeLine } from "@/lib/locations/address"

/** Search radii in miles, from the redesign prototype. */
export const RADII = [5, 10, 25, 50] as const
/** A search radius in miles: one the map offers. */
export type Radius = (typeof RADII)[number]
export const DEFAULT_RADIUS: Radius = 10

export const mapSearchParams = {
  /** The searched place's label, e.g. "Seattle, WA". */
  q: parseAsString,
  lat: parseAsFloat,
  lng: parseAsFloat,
  /** Radius in miles around the place or the viewer. */
  r: parseAsNumberLiteral(RADII),
  /** Camera zoom, with lat/lng, when the viewer moved the map themselves. */
  z: parseAsFloat,
  /** Two-letter state code. */
  state: parseAsString,
  types: parseAsArrayOf(parseAsStringLiteral(LOCATION_KINDS)),
  retailer: parseAsArrayOf(parseAsString),
  /** Database id of the location whose details are open. */
  location: parseAsString,
  /** "me": centered on the viewer's location, which stays out of the URL. */
  near: parseAsStringLiteral(["me"] as const),
  /** Location ids of an assistant route, in visiting order: drawn as a line with numbered stops. */
  route: parseAsArrayOf(parseAsString),
  /** Add a place is open (#125): "1" from the tab bar, then the kind once picked. */
  add: parseAsStringLiteral(["1", "shop", "event"] as const),
}

export type MapSearchParams = inferParserType<typeof mapSearchParams>

/** Reads the map's parameters from a page's `searchParams`. */
export const loadMapSearchParams = createLoader(mapSearchParams)

/** Builds a /map URL from parameters (unset ones are left out). */
export const mapUrl = createSerializer(mapSearchParams)

/** Rounds coordinates for the URL: places to ~10 m, cameras to ~100 m. */
export const roundPlace = (v: number) => Math.round(v * 1e4) / 1e4
export const roundCamera = (v: number) => Math.round(v * 1e3) / 1e3
export const roundZoom = (v: number) => Math.round(v * 10) / 10

/** An event on the map: the map searched to its city (or its title, without one), events shown. */
export const eventMapUrl = (e: Pick<UpcomingEvent, "title" | "city" | "state" | "lng" | "lat">) =>
  mapUrl("/map", { q: placeLine(e.city, e.state) || e.title, lng: roundPlace(e.lng), lat: roundPlace(e.lat), r: DEFAULT_RADIUS, types: ["event"] })

/**
 * The URL update once the viewer shares their position: near=me and the
 * radius, with every coordinate and other view cleared, so a copied link
 * never reveals where they are.
 */
export function nearMeParams(radius: Radius): Partial<MapSearchParams> {
  return { near: "me", r: radius, q: null, lat: null, lng: null, z: null, state: null, route: null }
}
