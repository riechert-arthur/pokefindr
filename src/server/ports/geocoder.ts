/**
 * Turns what someone typed ("Denver", "1600 Pennsylvania Ave", "98101") into
 * places on the map. Adapters live in `src/server/adapters/geocoder/`;
 * `getGeocoder()` (src/server/container.ts) picks one from config.
 */

/** What a result is, so the search list can show the right icon and the map the right view. */
export type GeocodeKind = "city" | "address" | "postcode" | "state" | "other"

export interface GeocodeResult {
  /** One line to show, e.g. "Denver, CO" or "1600 Pennsylvania Ave NW, Washington, DC". */
  label: string
  lng: number
  lat: number
  /** [west, south, east, north], when the provider gives an extent. */
  bbox?: [number, number, number, number]
  kind: GeocodeKind
  /** Two-letter code of the US state the result is in, when known. */
  state?: string
}

export interface GeocodeOptions {
  /** [lng, lat] to rank nearby results first. */
  near?: [number, number]
  /** At most this many results. Adapters default to 5. */
  limit?: number
  /** ISO 3166-1 alpha-2 code to search in. Defaults to "us": the map only covers the US today. */
  country?: string
  signal?: AbortSignal
}

export interface Geocoder {
  search(query: string, opts?: GeocodeOptions): Promise<GeocodeResult[]>
}

/** A provider answered with an error (bad key, rate limit, outage). */
export class GeocoderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "GeocoderError"
  }
}
