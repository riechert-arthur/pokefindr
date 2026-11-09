import { z } from "zod/v3"

/** Shortest query sent to the geocoder: one letter matches half the country. */
export const MIN_QUERY_LENGTH = 2
export const MAX_QUERY_LENGTH = 200

const coordinate = z.string().regex(/^-?\d+(\.\d+)?$/, "must be a plain decimal number").transform(Number)

/** `GET /api/geocode?q=…&near=lng,lat&limit=…`, shared by the route and its callers. */
export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(MIN_QUERY_LENGTH).max(MAX_QUERY_LENGTH),
  near: z
    .string()
    .transform((s) => s.split(","))
    .pipe(z.tuple([coordinate.pipe(z.number().min(-180).max(180)), coordinate.pipe(z.number().min(-90).max(90))]))
    .optional(),
  limit: z.coerce.number().int().min(1).max(10).optional(),
})

/**
 * `near` rounded to 0.1° (~10 km): close enough to rank results, and
 * coarse enough that nearby searchers share the CDN's cached answers.
 */
export const roundNear = ([lng, lat]: [number, number]) => `${lng.toFixed(1)},${lat.toFixed(1)}`
