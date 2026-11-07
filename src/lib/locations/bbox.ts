import { z } from "zod"
import { LOCATION_KINDS, type LocationKind } from "@/lib/types/locations"

/** [west, south, east, north] in degrees, as in GeoJSON. */
export type Bbox = [west: number, south: number, east: number, north: number]

/**
 * The largest area, in square degrees, one request may cover. The map asks
 * for locations from zoom 6, where even a 4K screen shows about 40° × 20°.
 * Anything bigger is a zoomed-out view, which uses region counts instead.
 */
export const MAX_BBOX_AREA = 1500

/** A plain decimal number: no empty values (which would coerce to 0), hex or exponents. */
const DECIMAL = /^-?\d+(\.\d+)?$/

export const coordinate = (min: number, max: number) =>
  z.string().regex(DECIMAL, "must be a decimal number").transform(Number).pipe(z.number().min(min).max(max))

const bboxSchema = z
  .string()
  .transform((s) => s.split(","))
  .pipe(z.tuple([coordinate(-180, 180), coordinate(-90, 90), coordinate(-180, 180), coordinate(-90, 90)]))
  .refine(([w, , e]) => w < e, "west must be less than east (boxes across the antimeridian aren't supported)")
  .refine(([, s, , n]) => s < n, "south must be less than north")
  .refine(([w, s, e, n]) => (e - w) * (n - s) <= MAX_BBOX_AREA, `the box covers more than ${MAX_BBOX_AREA} square degrees; zoom in`)

const typesSchema = z
  .string()
  .transform((s) => (s === "" ? [] : [...new Set(s.split(","))]))
  .pipe(z.array(z.enum(LOCATION_KINDS)))

/** `types=vending,shop`: every kind when absent, none when empty. */
export const kindsParam = typesSchema.optional().transform((t): LocationKind[] => t ?? [...LOCATION_KINDS])

/** `lng,lat` as plain decimals in range. */
export const pointParam = z
  .string()
  .transform((s) => s.split(","))
  .pipe(z.tuple([coordinate(-180, 180), coordinate(-90, 90)]))

/**
 * Query parameters for GET /api/locations?bbox=…&types=…
 * - `bbox`: west,south,east,north in degrees.
 * - `types`: comma-separated kinds; every kind when absent, none when empty.
 */
export const bboxQuerySchema = z.object({
  bbox: bboxSchema,
  types: kindsParam,
})

export type BboxQueryParams = z.infer<typeof bboxQuerySchema>
