import { z } from "zod/v3"
import { coordinate, kindsParam, pointParam } from "./bbox"
import { RADII } from "@/lib/map/url-state"
import { stateCode } from "@/lib/map/states"

/** A search radius in miles: one the map offers. */
const radiusParam = z.coerce.number().refine((r) => (RADII as readonly number[]).includes(r), `must be one of ${RADII.join(", ")}`)

/** Vending retailers, comma-separated, as in the map's URL (`retailer=`). Absent means all. */
export const retailerParam = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(",").map((r) => r.trim()).filter(Boolean) : []))

/** Most points one counts request may ask about: a search list's worth. */
export const MAX_COUNT_POINTS = 10

/**
 * GET /api/locations/counts?points=lng,lat;lng,lat&r=10&types=…
 * How many locations lie within `r` miles of each point.
 */
export const countsQuerySchema = z.object({
  points: z
    .string()
    .transform((s) => s.split(";"))
    .pipe(z.array(pointParam).min(1).max(MAX_COUNT_POINTS)),
  r: radiusParam,
  types: kindsParam,
  retailer: retailerParam,
})

/** The longest query /api/locations/search takes (the geocoder takes more, for full addresses). */
export const MAX_LOCATION_QUERY = 100

/** GET /api/locations/search?q=…&types=…&near=lng,lat&limit=… */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(MAX_LOCATION_QUERY),
  types: kindsParam,
  near: pointParam.optional(),
  retailer: retailerParam,
  limit: z.coerce.number().int().min(1).max(20).default(5),
})

/** GET /api/locations/near?lng=…&lat=…&r=10&types=…&retailer=… */
export const nearQuerySchema = z.object({
  lng: coordinate(-180, 180),
  lat: coordinate(-90, 90),
  r: radiusParam,
  types: kindsParam,
  /** Vending retailers, comma-separated, as in the map's URL. */
  retailer: retailerParam,
  /** The most rows to return (the closest); 500 by default. Counts and the total still cover every match. */
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

/** GET /api/locations/cities?state=WA&types=… */
export const citiesQuerySchema = z.object({
  state: z
    .string()
    .transform((s) => stateCode(s) ?? "")
    .pipe(z.string().min(2, "must be a US state code, like WA")),
  types: kindsParam,
  retailer: retailerParam,
})
