import "server-only"
import type { GeocodeKind, GeocodeOptions, GeocodeResult, Geocoder } from "@/server/ports/geocoder"
import { stateCode } from "@/lib/map/states"
import { cityLabel, clean, countryOf, endpoint, getJson, limitOf } from "./shared"

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
const AREA_LAYERS = ["city", "district", "county", "state"]

/**
 * Photon (OpenStreetMap, by komoot). Built for type-ahead, which Nominatim's
 * policy forbids. The public instance is free with fair use; set
 * GEOCODER_BASE_URL to a self-hosted one for heavy traffic.
 * https://github.com/komoot/photon
 */
export class PhotonGeocoder implements Geocoder {
  constructor(private readonly baseUrl = "https://photon.komoot.io") {}

  async search(query: string, opts?: GeocodeOptions): Promise<GeocodeResult[]> {
    const limit = limitOf(opts)
    // Without a number it's most likely a place name: settlements, counties
    // and states first, or "Denver" ranks museums, malls and apartment blocks
    // named Denver above Denver, IA. When those don't fill the list (a mall,
    // a landmark, a street without a number), everything else follows.
    // With a number ("98101", "1600 Pennsylvania"), everything at once.
    if (/\d/.test(query)) return clean((await this.request(query, limit, opts, false)).map(toResult), limit)
    const places = await this.request(query, limit, opts, true)
    // Photon's fuzzy matching fills a places-only list with poor matches
    // ("Mall of America" → Young America, American Canyon), so only places
    // named like the query come first.
    const named = places.filter((f) => namedLike(f.properties.name, query))
    if (named.length >= limit) return clean(named.map(toResult), limit)
    let rest: PhotonFeature[]
    try {
      rest = await this.request(query, limit, opts, false)
    } catch (err) {
      // The extra request is a bonus: keep the places already found.
      if (opts?.signal?.aborted || places.length === 0) throw err
      rest = []
    }
    return clean([...named, ...rest, ...places].map(toResult), limit)
  }

  private async request(query: string, limit: number, opts: GeocodeOptions | undefined, placesOnly: boolean): Promise<PhotonFeature[]> {
    const country = countryOf(opts).toUpperCase()
    const params = new URLSearchParams({ q: query, lang: "en", limit: String(limit * 3) })
    if (country === "US") params.set("bbox", US_BBOX)
    if (placesOnly) {
      for (const layer of AREA_LAYERS) params.append("layer", layer)
      params.set("osm_tag", "place")
    }
    if (opts?.near) {
      params.set("lon", String(opts.near[0]))
      params.set("lat", String(opts.near[1]))
    }
    const url = endpoint(this.baseUrl, "api/")
    url.search = params.toString()
    const body = await getJson<{ features?: PhotonFeature[] }>(url, "Photon", opts)
    // Asked for extra, since results from other countries are dropped here.
    return (body.features ?? []).filter((f) => f.properties.countrycode?.toUpperCase() === country)
  }
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/** "Den" or "Seattle, WA" for Denver or Seattle: the name starts with the query, or the query with the name. */
function namedLike(name: string | undefined, query: string): boolean {
  if (!name) return false
  const n = fold(name)
  const q = fold(query)
  return !!q && (n.startsWith(q) || q.startsWith(n))
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
