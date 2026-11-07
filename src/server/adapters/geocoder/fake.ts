import "server-only"
import type { GeocodeOptions, GeocodeResult, Geocoder } from "@/server/ports/geocoder"
import { clean, countryOf, limitOf } from "./shared"

/** A handful of real places, so search works in tests, CI and local dev with no account. */
export const FAKE_PLACES: readonly GeocodeResult[] = [
  { label: "Seattle, WA", lng: -122.3321, lat: 47.6062, kind: "city", state: "WA", bbox: [-122.4598, 47.4919, -122.2244, 47.7341] },
  { label: "Tacoma, WA", lng: -122.4443, lat: 47.2529, kind: "city", state: "WA" },
  { label: "Vancouver, WA", lng: -122.6615, lat: 45.6387, kind: "city", state: "WA" },
  { label: "Portland, OR", lng: -122.6765, lat: 45.5231, kind: "city", state: "OR" },
  { label: "Denver, CO", lng: -104.9903, lat: 39.7392, kind: "city", state: "CO", bbox: [-105.1099, 39.6144, -104.6003, 39.9142] },
  { label: "Denton, TX", lng: -97.1331, lat: 33.2148, kind: "city", state: "TX" },
  { label: "Phoenix, AZ", lng: -112.074, lat: 33.4484, kind: "city", state: "AZ" },
  { label: "Houston, TX", lng: -95.3698, lat: 29.7604, kind: "city", state: "TX" },
  { label: "Los Angeles, CA", lng: -118.2437, lat: 34.0522, kind: "city", state: "CA" },
  { label: "Chicago, IL", lng: -87.6298, lat: 41.8781, kind: "city", state: "IL" },
  { label: "Atlanta, GA", lng: -84.388, lat: 33.749, kind: "city", state: "GA" },
  { label: "New York, NY", lng: -74.006, lat: 40.7128, kind: "city", state: "NY" },
  { label: "Washington", lng: -120.7401, lat: 47.7511, kind: "state", state: "WA", bbox: [-124.734, 45.544, -116.916, 49.002] },
  { label: "Colorado", lng: -105.7821, lat: 39.5501, kind: "state", state: "CO", bbox: [-109.059, 36.993, -102.042, 41.002] },
  { label: "98101, Seattle, WA", lng: -122.3344, lat: 47.6114, kind: "postcode", state: "WA" },
  { label: "1600 Pennsylvania Ave NW, Washington, DC", lng: -77.0365, lat: 38.8977, kind: "address", state: "DC" },
]

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/** Matches on the start of the label or of any word in it, closest to `near` first. */
export class FakeGeocoder implements Geocoder {
  constructor(private readonly places: readonly GeocodeResult[] = FAKE_PLACES) {}

  async search(query: string, opts?: GeocodeOptions): Promise<GeocodeResult[]> {
    if (countryOf(opts) !== "us") return []
    const q = normalize(query)
    if (!q) return []
    const scored = this.places
      .map((p) => {
        const label = normalize(p.label)
        const score = label.startsWith(q) ? 0 : ` ${label}`.includes(` ${q}`) ? 1 : -1
        return { p, score }
      })
      .filter((x) => x.score >= 0)
    const near = opts?.near
    const dist = (p: GeocodeResult) => (near ? (p.lng - near[0]) ** 2 + (p.lat - near[1]) ** 2 : 0)
    scored.sort((a, b) => a.score - b.score || dist(a.p) - dist(b.p))
    return clean(scored.map((x) => ({ ...x.p })), limitOf(opts))
  }
}
