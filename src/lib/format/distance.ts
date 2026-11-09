/** Miles or kilometers. Distances and radii are stored in miles; only what's shown changes. */
export type DistanceUnit = "mi" | "km"

export const KM_PER_MILE = 1.609344

/** Where road distances are in miles. Everywhere else uses kilometers. */
const MILES_REGIONS = new Set(["US", "GB", "LR", "MM"])

/**
 * The unit for a language tag's region: miles for "en-US", "es-US" and
 * "en-GB", kilometers for "es-MX". A tag without a region ("en", "es", the
 * site's own languages) gets miles, since the map is of the US.
 */
export function distanceUnit(tag: string | undefined): DistanceUnit {
  let region: string | undefined
  try {
    region = tag ? new Intl.Locale(tag).region : undefined
  } catch {
    // Not a valid tag: no region.
  }
  return !region || MILES_REGIONS.has(region) ? "mi" : "km"
}

/** "0.4 mi", "0,6 km": a distance given in miles, in `unit`, written for `locale`. */
export function formatDistance(miles: number, locale: string, unit: DistanceUnit, digits = 1): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: unit === "km" ? "kilometer" : "mile",
    unitDisplay: "short",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(unit === "km" ? miles * KM_PER_MILE : miles)
}

/** A search radius in whole units: "5 mi", or "8 km" for the same 5 miles. */
export const formatRadius = (miles: number, locale: string, unit: DistanceUnit) => formatDistance(miles, locale, unit, 0)
