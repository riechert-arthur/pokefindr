import { z } from "zod"
import { kindsParam, pointParam } from "./bbox"
import { RADII } from "@/lib/map/url-state"

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
  r: z.coerce.number().refine((r) => (RADII as readonly number[]).includes(r), `must be one of ${RADII.join(", ")}`),
  types: kindsParam,
  retailer: retailerParam,
})

/** GET /api/locations/search?q=…&types=…&near=lng,lat&limit=… */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  types: kindsParam,
  near: pointParam.optional(),
  retailer: retailerParam,
  limit: z.coerce.number().int().min(1).max(20).default(5),
})
