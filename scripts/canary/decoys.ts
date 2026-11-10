/**
 * Canary locations (#202): made-up vending machines that only the map's
 * viewport request returns, so a copy of PokeFindr's data can be recognized.
 *
 * They're generated from a secret seed (CANARY_SEED), never stored in the
 * repo: the same seed always gives the same decoys, so `plant.ts` can add
 * them again without duplicates and `plant.ts --list` prints what to search a
 * copied dataset for. Each one is a real retailer in a town where it runs
 * machines, on a made-up street address, 1 to 4 km from the town's middle.
 */
import { createHmac } from "node:crypto"

// A type alias (not an interface) so it's assignable to postgres.js's JSON type.
export type Canary = {
  machineID: string
  retailer: string
  address: string
  city: string
  state: string
  lng: number
  lat: number
}

/** A retailer and a town it has machines in, at the middle of them. */
interface Place {
  retailer: string
  city: string
  state: string
  lng: number
  lat: number
}

const PLACES: readonly Place[] = [
  { retailer: "Safeway", city: "Colorado Springs", state: "CO", lng: -104.7934, lat: 38.8588 },
  { retailer: "Safeway", city: "Phoenix", state: "AZ", lng: -112.0318, lat: 33.4579 },
  { retailer: "Safeway", city: "Portland", state: "OR", lng: -122.6544, lat: 45.5276 },
  { retailer: "Kroger", city: "Houston", state: "TX", lng: -95.4324, lat: 29.8131 },
  { retailer: "Kroger", city: "Atlanta", state: "GA", lng: -84.3742, lat: 33.8081 },
  { retailer: "Kroger", city: "Cincinnati", state: "OH", lng: -84.5172, lat: 39.1879 },
  { retailer: "Kroger", city: "Marietta", state: "GA", lng: -84.5196, lat: 33.9812 },
  { retailer: "Fred Meyer", city: "Vancouver", state: "WA", lng: -122.5966, lat: 45.6532 },
  { retailer: "Fred Meyer", city: "Beaverton", state: "OR", lng: -122.8183, lat: 45.5034 },
  { retailer: "Albertsons", city: "Las Vegas", state: "NV", lng: -115.2793, lat: 36.2555 },
  { retailer: "Albertsons", city: "Eugene", state: "OR", lng: -123.1246, lat: 44.0689 },
  { retailer: "Albertsons", city: "Irvine", state: "CA", lng: -117.7917, lat: 33.6671 },
  { retailer: "King Soopers", city: "Aurora", state: "CO", lng: -104.8025, lat: 39.6591 },
  { retailer: "King Soopers", city: "Arvada", state: "CO", lng: -105.1011, lat: 39.8204 },
  { retailer: "King Soopers", city: "Lakewood", state: "CO", lng: -105.1101, lat: 39.7064 },
  { retailer: "Vons", city: "San Diego", state: "CA", lng: -117.1329, lat: 32.8326 },
  { retailer: "Vons", city: "Chula Vista", state: "CA", lng: -116.9638, lat: 32.6327 },
  { retailer: "Frys", city: "Gilbert", state: "AZ", lng: -111.7735, lat: 33.3171 },
  { retailer: "Frys", city: "Mesa", state: "AZ", lng: -111.7025, lat: 33.4074 },
  { retailer: "Frys", city: "Peoria", state: "AZ", lng: -112.2451, lat: 33.6385 },
  { retailer: "Jewel-Osco", city: "Chicago", state: "IL", lng: -87.6806, lat: 41.8982 },
  { retailer: "Jewel-Osco", city: "Hoffman Estates", state: "IL", lng: -88.097, lat: 42.0785 },
  { retailer: "WinCo Foods", city: "Boise", state: "ID", lng: -116.2418, lat: 43.6149 },
  { retailer: "H-E-B", city: "Austin", state: "TX", lng: -97.7986, lat: 30.3475 },
  { retailer: "H-E-B", city: "Cypress", state: "TX", lng: -95.6792, lat: 29.9624 },
  { retailer: "Food 4 Less", city: "Los Angeles", state: "CA", lng: -118.35, lat: 34.0772 },
  { retailer: "Shaw's", city: "Worcester", state: "MA", lng: -71.8242, lat: 42.265 },
  { retailer: "QFC", city: "Bellevue", state: "WA", lng: -122.1737, lat: 47.598 },
  { retailer: "QFC", city: "Redmond", state: "WA", lng: -122.0938, lat: 47.6851 },
  { retailer: "Pick 'n Save", city: "Milwaukee", state: "WI", lng: -87.9604, lat: 43.0663 },
  { retailer: "Smith's", city: "Salt Lake City", state: "UT", lng: -111.9023, lat: 40.7172 },
  { retailer: "Tom Thumb", city: "Richardson", state: "TX", lng: -96.7486, lat: 32.9894 },
]

const STREETS = [
  "Main", "Oak", "Maple", "Cedar", "Pine", "Elm", "Washington", "Lincoln", "Jefferson", "Park", "Lake", "Hill",
  "Ridge", "Valley", "Sunset", "Highland", "Meadow", "Mill", "Spring", "Church", "Center", "Broadway", "Grand",
  "Union", "Madison", "Franklin", "Jackson", "Willow", "Forest", "River",
]
const SUFFIXES = ["St", "Ave", "Rd", "Blvd", "Dr", "Pkwy", "Way"]
const DIRECTIONS = ["N", "S", "E", "W"]

/** Machine IDs past the real ones (Q00001 up), so a new real machine is unlikely to take one. */
const ID_FROM = 3000
const ID_COUNT = 2000

/** The shortest seed accepted: it's what keeps the decoys secret. */
export const MIN_SEED_LENGTH = 16
/** The most decoys: a few are enough to recognize a copy. */
export const MAX_CANARIES = PLACES.length

/** Numbers in [0, 1) from the seed, the same every run: HMAC-SHA256 of the seed over a label and a counter. */
function randoms(seed: string, label: string): () => number {
  let n = 0
  return () => createHmac("sha256", seed).update(`${label}:${n++}`).digest().readUInt32BE(0) / 2 ** 32
}

const pick = <T>(r: () => number, items: readonly T[]): T => items[Math.floor(r() * items.length)]
const round6 = (x: number) => Math.round(x * 1e6) / 1e6

/** `count` decoys from `seed`, each in its own town with its own machine ID. Throws on a short seed or too many. */
export function generateCanaries(seed: string, count: number): Canary[] {
  if (seed.length < MIN_SEED_LENGTH) throw new Error(`CANARY_SEED must be at least ${MIN_SEED_LENGTH} characters`)
  if (!Number.isInteger(count) || count < 1 || count > MAX_CANARIES) throw new Error(`The count must be 1 to ${MAX_CANARIES}`)
  const r = randoms(seed, "canary")
  const places = new Set<Place>()
  const ids = new Set<string>()
  const canaries: Canary[] = []
  while (canaries.length < count) {
    const place = pick(r, PLACES)
    if (places.has(place)) continue
    const machineID = `Q${String(ID_FROM + Math.floor(r() * ID_COUNT)).padStart(5, "0")}`
    if (ids.has(machineID)) continue
    places.add(place)
    ids.add(machineID)
    const number = 100 + Math.floor(r() * 9800)
    const direction = r() < 0.4 ? `${pick(r, DIRECTIONS)} ` : ""
    const address = `${number} ${direction}${pick(r, STREETS)} ${pick(r, SUFFIXES)}`
    // 1 to 4 km from the middle, in any direction.
    const km = 1 + r() * 3
    const bearing = r() * 2 * Math.PI
    const lat = place.lat + (km / 111.32) * Math.cos(bearing)
    const lng = place.lng + (km / (111.32 * Math.cos((place.lat * Math.PI) / 180))) * Math.sin(bearing)
    canaries.push({ machineID, retailer: place.retailer, address, city: place.city, state: place.state, lng: round6(lng), lat: round6(lat) })
  }
  return canaries
}
