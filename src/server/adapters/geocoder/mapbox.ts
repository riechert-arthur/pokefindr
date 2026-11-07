import "server-only"
import type { GeocodeKind, GeocodeOptions, GeocodeResult, Geocoder } from "@/server/ports/geocoder"
import { stateCode } from "@/lib/map/states"
import { cityLabel, clean, countryOf, endpoint, getJson, limitOf, shortLabel } from "./shared"

interface MapboxFeature {
  properties: {
    feature_type: string
    name: string
    full_address?: string
    place_formatted?: string
    coordinates: { longitude: number; latitude: number }
    bbox?: [number, number, number, number]
    context?: { region?: { region_code?: string; name?: string }; place?: { name?: string } }
  }
}

const KINDS: Record<string, GeocodeKind> = { place: "city", locality: "city", address: "address", postcode: "postcode", region: "state" }

/** Mapbox Search API v6 (forward geocoding). https://docs.mapbox.com/api/search/geocoding/ */
export class MapboxGeocoder implements Geocoder {
  constructor(
    private readonly accessToken: string,
    private readonly baseUrl = "https://api.mapbox.com",
  ) {}

  async search(query: string, opts?: GeocodeOptions): Promise<GeocodeResult[]> {
    const url = endpoint(this.baseUrl, "search/geocode/v6/forward")
    const limit = limitOf(opts)
    url.search = new URLSearchParams({
      q: query,
      access_token: this.accessToken,
      autocomplete: "true",
      language: "en",
      limit: String(limit),
      country: countryOf(opts),
      ...(opts?.near ? { proximity: opts.near.join(",") } : {}),
    }).toString()
    const body = await getJson<{ features?: MapboxFeature[] }>(url, "Mapbox", opts)
    return clean((body.features ?? []).map(toResult), limit)
  }
}

function toResult({ properties: p }: MapboxFeature): GeocodeResult {
  const kind = KINDS[p.feature_type] ?? "other"
  const region = p.context?.region
  const state = kind === "state" ? stateCode(p.name) : stateCode(region?.region_code) ?? stateCode(region?.name)
  // Short, like the other adapters: "1600 Pennsylvania Avenue Northwest, Washington, DC", "98101, Seattle, WA".
  const label = kind === "city" ? cityLabel(p.name, state) : kind === "state" ? p.name : shortLabel(p.name, p.context?.place?.name, state)
  return { label, lng: p.coordinates.longitude, lat: p.coordinates.latitude, bbox: p.bbox, kind, state }
}
