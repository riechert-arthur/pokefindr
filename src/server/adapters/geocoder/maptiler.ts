import "server-only"
import type { GeocodeKind, GeocodeOptions, GeocodeResult, Geocoder } from "@/server/ports/geocoder"
import { stateCode } from "@/lib/map/states"
import { cityLabel, clean, countryOf, getJson, limitOf } from "./shared"

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
    const url = new URL(`/geocoding/${encodeURIComponent(query)}.json`, this.baseUrl)
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
  const label = kind === "city" ? cityLabel(f.text, state) : kind === "state" ? f.text : f.place_name.replace(/, United States( of America)?$/, "")
  const [lng, lat] = f.center
  return { label, lng, lat, bbox: f.bbox, kind, state }
}
