/**
 * Countries PokeFindr covers. Adding one is a row here plus its detailed
 * outline file (below): the grey and "Not on PokeFindr yet" stop covering
 * it. (Its state shading, search and counts follow once its regions and
 * locations are imported.)
 *
 * - `alpha2`: ISO 3166-1 alpha-2, as stored in `locations.country_code`.
 * - `numeric`: ISO 3166-1 numeric, as in the outlines (public/geo/countries-110m.json).
 * - `shortName`: how the copy names it ("PokeFindr covers the US for now").
 * - `outline`: a detailed outline of the country. The grey covering the rest
 *   of the world has a hole in this exact shape, so the grey meets the
 *   country's own shading with no gap or overlap. (The 110m outlines are too
 *   coarse for that; they only tell which country is under the pointer.)
 */
export const SUPPORTED_COUNTRIES = [
  { alpha2: "US", numeric: "840", name: "United States", shortName: "the US", outline: "/geo/us-nation.json" },
] as const

/** Numeric codes of the supported countries, for map filters. */
export const SUPPORTED_COUNTRY_NUMERIC: readonly string[] = SUPPORTED_COUNTRIES.map((c) => c.numeric)

/** Country outlines (Natural Earth 1:110m, simplified), served from public/geo. */
export const COUNTRIES_URL = "/geo/countries-110m.json"

/** Wording from the redesign prototype. */
/** "the US", "the US and Canada", "the US, Canada and Mexico". */
const coveredList = (names: readonly string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`

/** Wording from the redesign prototype. */
export const UNSUPPORTED = {
  tooltip: "Not on PokeFindr yet",
  /** Names the country when the outlines know it (small ones, like Malta, aren't in the 110m set). */
  toastTitle: (name: string | null) => `${name ?? "This country"} isn't supported yet`,
  toastBody: `PokeFindr covers ${coveredList(SUPPORTED_COUNTRIES.map((c) => c.shortName))} for now. More countries are on the way.`,
}
