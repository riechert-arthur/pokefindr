import "server-only"
import type { GeocodeKind, GeocodeOptions, GeocodeResult, Geocoder } from "@/server/ports/geocoder"
import { stateCode } from "@/lib/map/states"
import { cityLabel, clean, countryOf, endpoint, getJson, limitOf } from "./shared"

interface MapTilerFeature {
  place_type: string[]
  text: string
  place_name: string
  center: [number, number]
  bbox?: [number, number, number, number]
  context?: { id: string; text: string }[]
}

const KINDS: Record<string, GeocodeKind> = {
  municipality: "city",
  place: "city",
  locality: "city",
  address: "address",
  postal_code: "postcode",
  region: "state",
}

/** MapTiler Geocoding API. https://docs.maptiler.com/cloud/api/geocoding/ */
export class MapTilerGeocoder implements Geocoder {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.maptiler.com",
  ) {}

  async search(query: string, opts?: GeocodeOptions): Promise<GeocodeResult[]> {
    const url = endpoint(this.baseUrl, `geocoding/${encodeURIComponent(query)}.json`)
    const limit = limitOf(opts)
    url.search = new URLSearchParams({
      key: this.apiKey,
      autocomplete: "true",
      language: "en",
      limit: String(limit),
      country: countryOf(opts),
      ...(opts?.near ? { proximity: opts.near.join(",") } : {}),
    }).toString()
    const body = await getJson<{ features?: MapTilerFeature[] }>(url, "MapTiler", opts)
    return clean((body.features ?? []).map(toResult), limit)
  }
}

function toResult(f: MapTilerFeature): GeocodeResult {
  const kind = KINDS[f.place_type[0]] ?? "other"
  const region = f.context?.find((c) => c.id.startsWith("region"))
  const state = kind === "state" ? stateCode(f.text) : stateCode(region?.text)
  const label = kind === "city" ? cityLabel(f.text, state) : kind === "state" ? f.text : shortPlaceName(f.place_name, region?.text, state)
  const [lng, lat] = f.center
  return { label, lng, lat, bbox: f.bbox, kind, state }
}

/**
 * "98101, Seattle, Washington, United States" → "98101, Seattle, WA", like
 * the other adapters. Only the last part naming the region is the state:
 * "10001, New York, New York" → "10001, New York, NY".
 */
function shortPlaceName(placeName: string, regionName?: string, state?: string): string {
  const parts = placeName.split(", ").filter((p) => !/^United States( of America)?$/.test(p))
  const i = state && regionName ? parts.lastIndexOf(regionName) : -1
  if (i >= 0) parts[i] = state!
  return parts.join(", ")
}
