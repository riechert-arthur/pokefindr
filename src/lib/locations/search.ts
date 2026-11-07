import { z } from "zod"
import { coordinate, kindsParam, pointParam } from "./bbox"
import { RADII } from "@/lib/map/url-state"

/** A search radius in miles: one the map offers. */
const radiusParam = z.coerce.number().refine((r) => (RADII as readonly number[]).includes(r), `must be one of ${RADII.join(", ")}`)

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
})

/** GET /api/locations/search?q=…&types=…&near=lng,lat&limit=… */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  types: kindsParam,
  near: pointParam.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
})

/** GET /api/locations/near?lng=…&lat=…&r=10&types=…&retailer=… */
export const nearQuerySchema = z.object({
  lng: coordinate(-180, 180),
  lat: coordinate(-90, 90),
  r: radiusParam,
  types: kindsParam,
  /** Vending retailers, comma-separated, as in the map's URL. */
  retailer: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((r) => r.trim()).filter(Boolean) : [])),
})
