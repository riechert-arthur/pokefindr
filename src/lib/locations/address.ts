/**
 * Street addresses compared as the same place however they're written
 * (#154): "12221 120th Avenue Northeast" and "12221 120th Ave. NE" both
 * become "12221 120th ave ne". Lowercase, periods dropped, other punctuation
 * a space, standard suffix and direction abbreviations, single spaces.
 *
 * Postgres has the same rules in normalize_address() (migration 0016),
 * which fills locations.address_normalized; a test checks they agree.
 */
export const ADDRESS_WORDS: readonly (readonly [string, string])[] = [
  ["avenue", "ave"],
  ["street", "st"],
  ["road", "rd"],
  ["drive", "dr"],
  ["boulevard", "blvd"],
  ["lane", "ln"],
  ["court", "ct"],
  ["place", "pl"],
  ["parkway", "pkwy"],
  ["highway", "hwy"],
  ["circle", "cir"],
  ["terrace", "ter"],
  ["square", "sq"],
  ["trail", "trl"],
  ["expressway", "expy"],
  ["freeway", "fwy"],
  ["center", "ctr"],
  ["suite", "ste"],
  ["northeast", "ne"],
  ["northwest", "nw"],
  ["southeast", "se"],
  ["southwest", "sw"],
  ["north", "n"],
  ["south", "s"],
  ["east", "e"],
  ["west", "w"],
]

const WORDS = new Map(ADDRESS_WORDS)

export function normalizeAddress(address: string | null | undefined): string | null {
  const words = (address ?? "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => WORDS.get(w) ?? w)
  return words.length ? words.join(" ") : null
}

/** A machine ID as the official list writes it: Q and five digits. */
export const MACHINE_ID = /^Q\d{5}$/

/** "q00245 " → "Q00245". */
export const normalizeMachineId = (id: string) => id.trim().toUpperCase()

type Part = string | null | undefined

/** "Seattle, WA": the city and state that are known, or "" for neither. */
export const placeLine = (city: Part, state: Part) => [city, state].filter(Boolean).join(", ")

/** "1820 SE Hawthorne Blvd, Portland, OR": the street address, city and state that are known. */
export const addressLine = ({ address, city, state }: { address?: Part; city?: Part; state?: Part }) => [address, placeLine(city, state)].filter(Boolean).join(", ")
