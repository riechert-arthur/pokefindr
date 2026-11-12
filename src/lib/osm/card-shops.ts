/**
 * Card shops from OpenStreetMap (#397): the Overpass query, which places
 * count, and how a place becomes one of our shops. Shared by the fetch script
 * (scripts/one-off/fetch-osm-shops.ts) and the import
 * (scripts/one-off/import-osm-shops.ts). See docs/database.md, "Card shops
 * from OpenStreetMap".
 */
import { stateCode } from "@/lib/map/states"

/** `locations.source` of the shops this import writes. */
export const OSM_SOURCE = "osm"

/** The ODbL's credit line, shown wherever these shops appear. */
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors"
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright"

/** Board-game cafes and clubs: not card shops, even when they sell games. */
const NOT_BOARD_GAME = `["cafe"!="board_game"]["club"!~"^board_games?$"]`

/**
 * The Overpass query (Overpass QL) for every place that may be a card shop in
 * `area`, the whole US by default:
 * - every `shop=collector` (card shops are mostly tagged this way, often with
 *   nothing about cards in the name: Dave & Adam's, Bleecker Trading);
 * - every `shop=games` (TCG stores, alongside board-game and chess stores);
 * - `hobby`, `comics`, `anime` and `toys` shops only when the name says cards,
 *   TCG or Pokémon;
 * - none tagged as a board-game cafe or club.
 * Coin and stamp dealers come back too: `isCoinOrStampDealer` drops them.
 */
export function overpassQuery(area = `area["ISO3166-1"="US"][admin_level=2]`): string {
  return [
    "[out:json][timeout:300];",
    `${area}->.a;`,
    "(",
    `  nwr["shop"="collector"]${NOT_BOARD_GAME}(area.a);`,
    `  nwr["shop"="games"]${NOT_BOARD_GAME}(area.a);`,
    `  nwr["shop"~"^(hobby|comics|anime|toys)$"]["name"~"card|tcg|pok",i]${NOT_BOARD_GAME}(area.a);`,
    ");",
    "out tags center;",
  ].join("\n")
}

/** A place in Overpass's JSON: a node has `lat`/`lon`, a way or relation its `center`. */
export interface OsmElement {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

const COIN_OR_STAMP = /coin|stamp|banknote|currency|bullion|numismat|philatel|medal|\bgold\b|\bsilver\b/i
/** Cards (not postcards: "stamps;postcards" is a stamp dealer), TCG, Pokémon, Magic or games. */
const CARDS_OR_GAMES = /(?<!post)card|tcg|pok[eé]|magic|game/i

/**
 * A coin, stamp or bullion dealer, which `shop=collector` also covers (#397):
 * - by tag: `collector` names coins, stamps, banknotes, … and not cards or games;
 * - by name, when there's no `collector` tag: the name says coins, stamps,
 *   gold, … and not cards or games ("Hauser's Coins", "The Gold Experts").
 * A shop that names both stays: "Arundel Cards & Coins" sells cards, and so
 * does "Silver Dragon Games".
 */
export function isCoinOrStampDealer(tags: Record<string, string>): boolean {
  const collector = tags.collector
  if (collector) return COIN_OR_STAMP.test(collector) && !CARDS_OR_GAMES.test(collector)
  const name = tags.name ?? ""
  return COIN_OR_STAMP.test(name) && !CARDS_OR_GAMES.test(name)
}

/** One shop in the snapshot (src/data/osm_card_shops.json), in our terms. */
export interface OsmShop {
  /** `node/777464960`: OSM's own id, which `locations.external_id` keeps. */
  externalId: string
  name: string
  address: string | null
  city: string | null
  /** Two letters, from the position when it's in a state's outline, else from `addr:state`. */
  state: string | null
  postalCode: string | null
  lng: number
  lat: number
  website: string | null
  /** OSM's `opening_hours`, as written ("Mo-Sa 11:00-19:00"). */
  hours: string | null
  /** Every tag, kept in `locations.raw`. */
  tags: Record<string, string>
}

const text = (v: string | undefined) => (v && v.trim() ? v.trim() : null)

/** "123" + "Main Street", or the street alone, or null. */
function streetAddress(tags: Record<string, string>): string | null {
  const street = text(tags["addr:street"])
  if (!street) return null
  const number = text(tags["addr:housenumber"])
  return number ? `${number} ${street}` : street
}

/** The website, with a scheme so it links: OSM often has bare `example.com`. */
function website(tags: Record<string, string>): string | null {
  const url = text(tags.website) ?? text(tags["contact:website"])
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

/**
 * The element as one of our shops, or null when it has no name or position.
 * `stateAt` finds the state from the position (most places have no
 * `addr:state`); without one, or outside every state, the tag is used.
 */
export function toShop(el: OsmElement, stateAt?: (lng: number, lat: number) => string | null): OsmShop | null {
  const tags = el.tags ?? {}
  const name = text(tags.name)
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (!name || lat === undefined || lng === undefined) return null
  return {
    externalId: `${el.type}/${el.id}`,
    name,
    address: streetAddress(tags),
    city: text(tags["addr:city"]),
    state: stateAt?.(lng, lat) ?? stateCode(tags["addr:state"]) ?? null,
    postalCode: text(tags["addr:postcode"]),
    lng,
    lat,
    website: website(tags),
    hours: text(tags.opening_hours),
    tags,
  }
}

/** What the fetch script left out, by reason, so a person can check it. */
export interface Dropped {
  coinOrStamp: { externalId: string; name: string }[]
  /** No name or no position. */
  unusable: string[]
}

/**
 * Turns Overpass's elements into the snapshot's shops: drops coin and stamp
 * dealers and places without a name or position, keeps each OSM id once, and
 * sorts by id so a new snapshot diffs cleanly against the last.
 */
export function selectShops(elements: OsmElement[], stateAt?: (lng: number, lat: number) => string | null): { shops: OsmShop[]; dropped: Dropped } {
  const dropped: Dropped = { coinOrStamp: [], unusable: [] }
  const byId = new Map<string, OsmShop>()
  for (const el of elements) {
    const id = `${el.type}/${el.id}`
    const tags = el.tags ?? {}
    if (isCoinOrStampDealer(tags)) {
      dropped.coinOrStamp.push({ externalId: id, name: tags.name ?? "" })
      continue
    }
    const shop = toShop(el, stateAt)
    if (!shop) dropped.unusable.push(id)
    else byId.set(id, shop)
  }
  const byExternalId = (a: { externalId: string }, b: { externalId: string }) => (a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0)
  dropped.coinOrStamp.sort(byExternalId)
  dropped.unusable.sort()
  return { shops: [...byId.values()].sort(byExternalId), dropped }
}

/** How a new list of shops differs from the snapshot's (`--dry-run`): OSM ids added, removed, and changed. */
export function compareShops<T extends { externalId: string }>(before: T[], after: T[]) {
  const old = new Map(before.map((s) => [s.externalId, JSON.stringify(s)]))
  const now = new Map(after.map((s) => [s.externalId, JSON.stringify(s)]))
  return {
    added: [...now.keys()].filter((id) => !old.has(id)),
    removed: [...old.keys()].filter((id) => !now.has(id)),
    changed: [...now.keys()].filter((id) => old.has(id) && old.get(id) !== now.get(id)),
  }
}
