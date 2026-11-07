import "server-only"
import type { GeocodeKind, GeocodeOptions, GeocodeResult, Geocoder } from "@/server/ports/geocoder"
import { stateCode } from "@/lib/map/states"
import { cityLabel, clean, countryOf, getJson, limitOf } from "./shared"

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    type?: string
    osm_value?: string
    name?: string
    housenumber?: string
    street?: string
    city?: string
    state?: string
    countrycode?: string
    /** [west, north, east, south]. */
    extent?: [number, number, number, number]
  }
}

/** The 50 states, DC and Puerto Rico. Photon has no country filter, so a box narrows the search. */
const US_BBOX = "-180,17,-64,72"

/**
 * Photon (OpenStreetMap, by komoot). Built for type-ahead, which Nominatim's
 * policy forbids. The public instance is free with fair use; set
 * GEOCODER_BASE_URL to a self-hosted one for heavy traffic.
 * https://github.com/komoot/photon
 */
export class PhotonGeocoder implements Geocoder {
  constructor(private readonly baseUrl = "https://photon.komoot.io") {}

  async search(query: string, opts?: GeocodeOptions): Promise<GeocodeResult[]> {
    const url = new URL("/api/", this.baseUrl)
    const limit = limitOf(opts)
    const country = countryOf(opts).toUpperCase()
    const params = new URLSearchParams({ q: query, lang: "en", limit: String(limit * 3) })
    if (country === "US") params.set("bbox", US_BBOX)
    if (opts?.near) {
      params.set("lon", String(opts.near[0]))
      params.set("lat", String(opts.near[1]))
    }
    url.search = params.toString()
    const body = await getJson<{ features?: PhotonFeature[] }>(url, "Photon", opts)
    // Asked for extra, since results from other countries are dropped here.
    const features = (body.features ?? []).filter((f) => f.properties.countrycode?.toUpperCase() === country)
    return clean(features.map(toResult), limit)
  }
}

function kindOf(p: PhotonFeature["properties"]): GeocodeKind {
  if (p.osm_value === "postcode") return "postcode"
  switch (p.type) {
    case "city":
    case "district":
    case "locality":
      return "city"
    case "state":
      return "state"
    case "street":
      return "address"
    case "house":
      return p.housenumber ? "address" : "other"
    default:
      return "other"
  }
}

function toResult({ geometry, properties: p }: PhotonFeature): GeocodeResult {
  const kind = kindOf(p)
  const state = stateCode(kind === "state" ? p.name : p.state)
  const name = p.name ?? ""
  let label: string
  if (kind === "city") label = cityLabel(name, state)
  else if (kind === "state") label = name
  else {
    const first = kind === "address" && p.housenumber && p.street ? `${p.housenumber} ${p.street}` : name || p.street || ""
    label = [first, p.city !== first ? p.city : undefined, state].filter(Boolean).join(", ")
  }
  const [lng, lat] = geometry.coordinates
  const e = p.extent
  return { label, lng, lat, bbox: e ? [e[0], e[3], e[2], e[1]] : undefined, kind, state }
}
