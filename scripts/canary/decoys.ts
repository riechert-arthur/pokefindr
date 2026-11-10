/**
 * Canary locations (#202): made-up vending machines planted among the real
 * ones, so a copy of PokeFindr's data can be recognized.
 *
 * Nothing here says where they are. plant.ts builds each one from the real
 * data at the time, with crypto randomness: a real retailer in a town where
 * it runs machines, a machine ID from a gap among the real ones, and a
 * made-up street address 1 to 4 km from that retailer's machines there.
 * The database is the only record of them (`locations.canary`).
 */
import { randomInt } from "node:crypto"

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

/** A retailer in a town, at the middle of its machines there. */
export type Group = {
  retailer: string
  city: string
  state: string
  lng: number
  lat: number
}

/** A random whole number in [0, n). */
export type RandomInt = (n: number) => number
export const cryptoRandomInt: RandomInt = (n) => randomInt(n)

/** The real machine IDs' shape: Q and five digits. */
const MACHINE_ID = /^Q(\d{5})$/
export const formatMachineId = (n: number) => `Q${String(n).padStart(5, "0")}`

/**
 * The machine-ID numbers from 1 to the highest in use that nothing uses:
 * a decoy's ID falls among the real ones. Throws when there are none.
 */
export function unusedMachineNumbers(used: Iterable<string | null>): number[] {
  const taken = new Set<number>()
  for (const id of used) {
    const m = id ? MACHINE_ID.exec(id) : null
    if (m) taken.add(Number(m[1]))
  }
  const max = Math.max(0, ...taken)
  const free: number[] = []
  for (let n = 1; n < max; n++) if (!taken.has(n)) free.push(n)
  if (!free.length) throw new Error("No unused machine IDs among the real ones")
  return free
}

const STREETS = [
  "Main", "Oak", "Maple", "Cedar", "Pine", "Elm", "Washington", "Lincoln", "Jefferson", "Park", "Lake", "Hill",
  "Ridge", "Valley", "Sunset", "Highland", "Meadow", "Mill", "Spring", "Church", "Center", "Broadway", "Grand",
  "Union", "Madison", "Franklin", "Jackson", "Willow", "Forest", "River", "Walnut", "Chestnut", "Sycamore",
  "Birch", "Aspen", "Spruce", "Hickory", "Magnolia", "Laurel", "Prospect", "Pleasant", "Fairview", "Lakeview",
  "Riverside", "Hillcrest", "Market", "College", "Academy", "Commerce", "Industrial", "Railroad", "Canyon",
]
const SUFFIXES = ["St", "Ave", "Rd", "Blvd", "Dr", "Pkwy", "Way", "Ln", "Hwy"]
const DIRECTIONS = ["N", "S", "E", "W"]

const pick = <T>(rand: RandomInt, items: readonly T[]): T => items[rand(items.length)]
/** A number in [from, to), in millionths. */
const between = (rand: RandomInt, from: number, to: number) => from + (rand(1_000_000) / 1_000_000) * (to - from)
const round6 = (x: number) => Math.round(x * 1e6) / 1e6

/** A decoy of `group`'s retailer with machine ID number `machineNumber`, 1 to 4 km from the group's middle. */
export function makeDecoy(group: Group, machineNumber: number, rand: RandomInt = cryptoRandomInt): Canary {
  const direction = rand(10) < 3 ? `${pick(rand, DIRECTIONS)} ` : ""
  const address = `${100 + rand(19_900)} ${direction}${pick(rand, STREETS)} ${pick(rand, SUFFIXES)}`
  const km = between(rand, 1, 4)
  const bearing = between(rand, 0, 2 * Math.PI)
  const lat = group.lat + (km / 111.32) * Math.cos(bearing)
  const lng = group.lng + (km / (111.32 * Math.cos((group.lat * Math.PI) / 180))) * Math.sin(bearing)
  return {
    machineID: formatMachineId(machineNumber),
    retailer: group.retailer,
    address,
    city: group.city,
    state: group.state,
    lng: round6(lng),
    lat: round6(lat),
  }
}
