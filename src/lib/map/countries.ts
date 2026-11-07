/**
 * Countries PokeFindr covers. Adding one is a row here: its map shading
 * switches on, and its outline stops being grey with "Not on PokeFindr yet".
 * (Search and counts follow once its locations are imported.)
 *
 * - `alpha2`: ISO 3166-1 alpha-2, as stored in `locations.country_code`.
 * - `numeric`: ISO 3166-1 numeric, as in the outlines (public/geo/countries-110m.json).
 */
export const SUPPORTED_COUNTRIES = [
  { alpha2: "US", numeric: "840", name: "United States" },
] as const

/** Numeric codes of the supported countries, for map filters. */
export const SUPPORTED_COUNTRY_NUMERIC: readonly string[] = SUPPORTED_COUNTRIES.map((c) => c.numeric)

/** Country outlines (Natural Earth 1:110m, simplified), served from public/geo. */
export const COUNTRIES_URL = "/geo/countries-110m.json"

/** Wording from the redesign prototype. */
export const UNSUPPORTED = {
  tooltip: "Not on PokeFindr yet",
  toastTitle: (name: string) => `${name} isn't supported yet`,
  toastBody: "PokeFindr covers the US for now. More countries are on the way.",
}
