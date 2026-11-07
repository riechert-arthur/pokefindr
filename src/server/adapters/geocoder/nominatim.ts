import "server-only"
import type { GeocodeKind, GeocodeOptions, GeocodeResult, Geocoder } from "@/server/ports/geocoder"
import { stateCode } from "@/lib/map/states"
import { cityLabel, clean, countryOf, endpoint, getJson, limitOf } from "./shared"

interface NominatimPlace {
  lat: string
  lon: string
  name?: string
  display_name: string
  addresstype?: string
  /** [south, north, west, east], as strings. */
  boundingbox?: [string, string, string, string]
  address?: Record<string, string | undefined>
}

const KINDS: Record<string, GeocodeKind> = {
  city: "city",
  town: "city",
  village: "city",
  hamlet: "city",
  municipality: "city",
  house: "address",
  building: "address",
  road: "address",
  postcode: "postcode",
  state: "state",
}

/**
 * Nominatim (OpenStreetMap). The public instance's usage policy requires a
 * User-Agent naming the app and forbids autocomplete, so only use it for
 * searches someone submits, or point it at your own instance.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
export class NominatimGeocoder implements Geocoder {
  constructor(
    private readonly userAgent: string,
    private readonly baseUrl = "https://nominatim.openstreetmap.org",
  ) {}

  async search(query: string, opts?: GeocodeOptions): Promise<GeocodeResult[]> {
    const url = endpoint(this.baseUrl, "search")
    const limit = limitOf(opts)
    url.search = new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      "accept-language": "en",
      limit: String(limit),
      countrycodes: countryOf(opts),
    }).toString()
    const places = await getJson<NominatimPlace[]>(url, "Nominatim", opts, { "User-Agent": this.userAgent })
    return clean(places.map(toResult), limit)
  }
}

function toResult(p: NominatimPlace): GeocodeResult {
  const a = p.address ?? {}
  // A building with a number (addresstype "office", "shop", …) is still an address.
  const kind = KINDS[p.addresstype ?? ""] ?? (a.house_number ? "address" : "other")
  const state = stateCode(a["ISO3166-2-lvl4"]) ?? stateCode(a.state)
  const city = a.city ?? a.town ?? a.village ?? a.hamlet
  let label = p.display_name.replace(/, United States( of America)?$/, "")
  if (kind === "city") label = cityLabel(p.name ?? city ?? label, state)
  else if (kind === "state") label = a.state ?? p.name ?? label
  else if (kind === "address" && a.road) label = [[a.house_number, a.road].filter(Boolean).join(" "), city, state].filter(Boolean).join(", ")
  else if (kind === "postcode" && a.postcode) label = [a.postcode, city, state].filter(Boolean).join(", ")
  const bb = p.boundingbox?.map(Number)
  const bbox = bb && bb.every(Number.isFinite) ? ([bb[2], bb[0], bb[3], bb[1]] as [number, number, number, number]) : undefined
  return { label, lng: Number(p.lon), lat: Number(p.lat), bbox, kind, state }
}
