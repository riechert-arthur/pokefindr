/**
 * Turns GeoJSON features (src/data/vending_machines_mod.json) into rows for
 * `locations_staging`.
 *
 * Pure functions, no database: see merge.ts for the writes.
 */
import { readFileSync } from "node:fs"

export interface SourceFeature {
  type?: string
  geometry?: { type?: string; coordinates?: unknown } | null
  properties?: Record<string, unknown> & {
    machineID?: unknown
    retailer?: unknown
    address?: unknown
    city?: unknown
    state?: unknown
    name?: unknown
    full_address?: unknown
    place_formatted?: unknown
    mapbox_id?: unknown
    coordinates?: { longitude?: unknown; latitude?: unknown; accuracy?: unknown } | null
    match_code?: unknown
    context?: { postcode?: { name?: unknown } } | null
    _manual_override?: unknown
  }
}

export interface SourceCollection {
  features: SourceFeature[]
}

/** One row of `locations_staging`. Keys are column names. */
export interface LocationRow {
  machineID: string
  retailer: string | null
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  name: string | null
  description: string | null
  lng: number
  lat: number
  mapbox_id: string | null
  geocode_accuracy: string | null
  match_code: Record<string, string> | null
  manual_override: boolean
  raw: Record<string, unknown>
}

export type ParseResult = { row: LocationRow; warning?: string } | { skip: string }

/** `source` for machines from the official Pokémon Center list. */
export const SCRAPED_SOURCE = "pokemoncenter"

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

function pair(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length < 2) return null
  const [lng, lat] = v
  return isNum(lng) && isNum(lat) ? [lng, lat] : null
}

const inRange = ([lng, lat]: [number, number]) => Math.abs(lng) <= 180 && Math.abs(lat) <= 90

function matchCode(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const out = Object.fromEntries(Object.entries(v).filter(([, value]) => typeof value === "string"))
  return Object.keys(out).length ? (out as Record<string, string>) : null
}

/**
 * Coordinates come from the GeoJSON geometry first: that's what the map has
 * always drawn, and where scripts/manual_validation.py wrote hand corrections.
 * `properties.coordinates` (Mapbox's original answer) is only a fallback.
 */
export function toLocationRow(feature: SourceFeature): ParseResult {
  const p = feature.properties ?? {}
  const machineID = text(p.machineID)
  if (!machineID) return { skip: "no machineID" }

  let warning: string | undefined
  let position = pair(feature.geometry?.coordinates)
  if (position && !inRange(position)) {
    // A hand correction typed as latitude, longitude.
    const swapped: [number, number] = [position[1], position[0]]
    if (!inRange(swapped)) return { skip: `${machineID}: coordinates out of range` }
    warning = `${machineID}: geometry [${position.join(", ")}] is out of range; used it swapped, [${swapped.join(", ")}]`
    position = swapped
  }
  position ??= pair([p.coordinates?.longitude, p.coordinates?.latitude])
  if (!position) return { skip: `${machineID}: no coordinates` }
  if (!inRange(position)) return { skip: `${machineID}: coordinates out of range` }
  const [lng, lat] = position

  // feature_index is the array position, not part of the machine.
  const { feature_index: _index, _manual_override: _override, ...raw } = p

  return {
    warning,
    row: {
      machineID,
      retailer: text(p.retailer),
      address: text(p.address),
      city: text(p.city),
      state: text(p.state),
      postal_code: text(p.context?.postcode?.name),
      name: text(p.name) ?? text(p.address),
      description: text(p.full_address) ?? text(p.place_formatted),
      lng,
      lat,
      mapbox_id: text(p.mapbox_id),
      geocode_accuracy: text(p.coordinates?.accuracy),
      match_code: matchCode(p.match_code),
      manual_override: p._manual_override === true,
      raw,
    },
  }
}

export interface ParsedSource {
  rows: LocationRow[]
  /** Features left out, with the reason. */
  skipped: string[]
  /** machineIDs that appeared more than once; the first one is kept. */
  duplicates: string[]
  /** Rows kept after a fix-up worth a look, e.g. swapped coordinates. */
  warnings: string[]
  total: number
}

export function parseFeatures(collection: SourceCollection): ParsedSource {
  if (!collection || !Array.isArray(collection.features)) {
    throw new Error("Expected a GeoJSON FeatureCollection with a features array")
  }
  const rows: LocationRow[] = []
  const skipped: string[] = []
  const warnings: string[] = []
  const duplicates: string[] = []
  const seen = new Set<string>()
  collection.features.forEach((feature, i) => {
    const result = toLocationRow(feature)
    if ("skip" in result) {
      skipped.push(`#${i} ${result.skip}`)
    } else if (seen.has(result.row.machineID)) {
      duplicates.push(result.row.machineID)
    } else {
      seen.add(result.row.machineID)
      if (result.warning) warnings.push(result.warning)
      rows.push(result.row)
    }
  })
  return { rows, skipped, duplicates, warnings, total: collection.features.length }
}

export function readFeatureFile(file: string): ParsedSource {
  return parseFeatures(JSON.parse(readFileSync(file, "utf8")) as SourceCollection)
}
