/**
 * One-off: copies the machines in src/data/vending_machines_mod.json into
 * `locations` (#73).
 *
 * Not a migration: the migrate workflow runs it with --apply after
 * `db:migrate`, in its own transaction, so it never holds the migrations' locks
 * and schema checks never replay it. To run it by hand (to preview, or on a
 * local database):
 *
 *   npm run db:import-locations                    # dry run: rolled back
 *   npm run db:import-locations -- --apply         # write
 *   npm run db:import-locations -- --file <geojson> --report <json>
 *
 * How it works, all in one transaction:
 * 1. Parse: each GeoJSON feature becomes a row. Coordinates come from the
 *    geometry first (what the map draws, and where hand corrections were
 *    saved), then `properties.coordinates`. Every machine is in the US, so a
 *    position outside it is swapped back if it was typed as latitude, longitude
 *    (a swapped geometry only when it lands near Mapbox's point).
 * 2. Load the rows into `location_import`, a temporary table dropped at
 *    commit. `locations_staging` belongs to the ETL and is never touched.
 * 3. Merge into `locations` on "machineID", writing only rows that change, so
 *    running it again writes nothing. `_manual_override` becomes
 *    manual_override with manual_override_source 'file', so dropping the flag
 *    from the file clears it again. An override made in the database (source
 *    null) is kept unless the file overrides that machine too. Machines in the
 *    table but not in the file are listed, never deleted.
 *
 *    While the JSON exists, it wins: every deploy writes the file's values
 *    (active, official, address, position, ...) over any machine without a
 *    database override. To make a database edit stick, such as deactivating a
 *    closed machine, also set manual_override. Once the JSON is gone (#80) the
 *    import stops and the database is the only source.
 * 4. Verify every machine is present, active, within 1e-6 degrees of the file
 *    and flagged when overridden. Otherwise throw, so nothing is written.
 *
 * Table names are unqualified, so they follow search_path.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { sql, type Kysely } from "kysely"
import { loadDevEnv, migrationClient, ROOT_DIR } from "../db/env"
import { createMigrator, inRolledBackTransaction } from "../db/migrator"

type Db = Kysely<unknown>

export const DEFAULT_FILE = path.join(ROOT_DIR, "src/data/vending_machines_mod.json")


// ─── Parse ─────────────────────────────────────────────────────────────────

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

/** One row of the import's temporary `location_import` table. Keys are column names. */
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
/** machineIDs are text, but a whole number is taken as its digits rather than dropped. */
const id = (v: unknown) => (Number.isSafeInteger(v) ? String(v) : text(v))

function pair(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length < 2) return null
  const [lng, lat] = v
  return isNum(lng) && isNum(lat) ? [lng, lat] : null
}

/**
 * Every machine is in the US. These boxes cover the states, Alaska (including
 * the Aleutians past the antimeridian), Hawaii, Puerto Rico, the US Virgin
 * Islands, Guam, the Northern Mariana Islands and American Samoa. Much tighter
 * than the valid range, so a position typed as latitude, longitude (e.g.
 * [40.71, -74.0] for New York) falls outside them, while its swap falls inside.
 */
export const US_BOUNDS = [
  { minLng: -180, maxLng: -64, minLat: 17, maxLat: 72 }, // states, Alaska, Hawaii, Puerto Rico, USVI
  { minLng: 172, maxLng: 180, minLat: 51, maxLat: 54 }, // western Aleutians
  { minLng: 144, maxLng: 146.2, minLat: 13, maxLat: 21 }, // Guam, Northern Mariana Islands
  { minLng: -171.2, maxLng: -168, minLat: -14.6, maxLat: -11 }, // American Samoa
]
const inUS = ([lng, lat]: [number, number]) =>
  US_BOUNDS.some((b) => lng >= b.minLng && lng <= b.maxLng && lat >= b.minLat && lat <= b.maxLat)

/**
 * How far (in degrees, on each axis) a swapped position may be from another
 * position in the feature before it stops counting as a fix. Hand corrections
 * move a machine a few hundred meters, not tens of kilometers.
 */
export const SWAP_TOLERANCE = 0.1
const near = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) <= SWAP_TOLERANCE && Math.abs(a[1] - b[1]) <= SWAP_TOLERANCE
const swap = ([lng, lat]: [number, number]): [number, number] => [lat, lng]

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
  const machineID = id(p.machineID)
  if (!machineID) return { skip: "no machineID" }

  const geometry = pair(feature.geometry?.coordinates)
  const mapbox = pair([p.coordinates?.longitude, p.coordinates?.latitude])
  // Mapbox's point, swapped back if it was typed as latitude, longitude.
  const mapboxFixed = mapbox && (inUS(mapbox) ? mapbox : inUS(swap(mapbox)) ? swap(mapbox) : null)

  // What was wrong along the way, so a corrupt geometry isn't reported as missing.
  const problems: string[] = []
  let position: [number, number] | null = null
  if (geometry && inUS(geometry)) {
    position = geometry
  } else if (geometry) {
    const bad = `geometry [${geometry.join(", ")}] is outside the US`
    // Usually a hand correction typed as latitude, longitude. Only trust the
    // swap if it lands near Mapbox's point, when there is one to check against.
    const swapped = swap(geometry)
    if (inUS(swapped) && (!mapboxFixed || near(swapped, mapboxFixed))) {
      position = swapped
      problems.push(`${bad}; used it swapped, [${swapped.join(", ")}]`)
    } else if (inUS(swapped)) {
      problems.push(`${bad}; swapped, it's more than ${SWAP_TOLERANCE}° from properties.coordinates`)
    } else {
      problems.push(bad)
    }
  }
  if (!position) {
    if (!geometry && !mapbox) return { skip: `${machineID}: no coordinates` }
    if (!mapboxFixed) {
      problems.push(mapbox ? `properties.coordinates [${mapbox.join(", ")}] are outside the US` : "no properties.coordinates")
      return { skip: `${machineID}: ${problems.join("; ")}` }
    }
    if (mapboxFixed !== mapbox) {
      problems.push(`properties.coordinates [${mapbox!.join(", ")}] are outside the US; used them swapped, [${mapboxFixed.join(", ")}]`)
    } else if (problems.length) {
      problems.push("used properties.coordinates")
    }
    position = mapboxFixed
  }
  const warning = problems.length ? `${machineID}: ${problems.join("; ")}` : undefined
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

// ─── Stage, merge, verify ──────────────────────────────────────────────────

const BATCH_SIZE = 500

/** Columns that describe the machine, and that the merge owns. */
const DATA_COLUMNS = [
  "retailer",
  "address",
  "city",
  "state",
  "postal_code",
  "name",
  "description",
  "geog",
  "is_official",
  "is_active",
  "source",
  "mapbox_id",
  "geocode_accuracy",
  "match_code",
  "raw",
]

/** Columns the merge owns. Everything else (id, created_by, created_at) is left alone. */
const MERGED_COLUMNS = [...DATA_COLUMNS, "manual_override", "manual_override_source"]

const q = (column: string) => `"${column}"`
/** geography has no reliable equality; compare its binary form. */
const comparable = (prefix: string, column: string) =>
  column === "geog" ? `ST_AsEWKB(${prefix}.geog::geometry)` : `${prefix}.${q(column)}`

/**
 * A database override the file doesn't replace: set in the database (source
 * not 'file'), and the file doesn't override the machine itself. The merge
 * keeps its values, and verification doesn't compare them with the file.
 */
const keptOverride = (cur: string, s: string) =>
  `(${cur}.manual_override and ${cur}.manual_override_source is distinct from 'file' and not ${s}.manual_override)`

/**
 * Loads `rows` into `location_import`, a temporary table only this transaction
 * sees, dropped at commit. Using it instead of `locations_staging` leaves the
 * ETL's rows and locks alone.
 */
export async function loadStaging(db: Db, rows: LocationRow[]): Promise<void> {
  // Outside a transaction, `on commit drop` would drop the table straight away.
  if (!db.isTransaction) throw new Error("loadStaging needs a transaction")
  // pg_temp, so this can never drop a permanent table of the same name.
  await sql`drop table if exists pg_temp.location_import`.execute(db)
  await sql`
    create temporary table location_import (
      "machineID" text primary key,
      retailer text, address text, city text, state text, postal_code text,
      name text, description text, geog geography(point, 4326) not null,
      is_official boolean not null, is_active boolean not null, source text,
      mapbox_id text, geocode_accuracy text, match_code jsonb,
      manual_override boolean not null, manual_override_source text, raw jsonb
    ) on commit drop`.execute(db)
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    // Sent as text and cast, so the driver can't encode the JSON twice.
    const batch = JSON.stringify(rows.slice(i, i + BATCH_SIZE))
    await sql`
      insert into location_import (
        "machineID", retailer, address, city, state, postal_code, name, description, geog, is_official,
        is_active, source, mapbox_id, geocode_accuracy, match_code, manual_override, manual_override_source, raw
      )
      select
        r."machineID", r.retailer, r.address, r.city, r.state, r.postal_code, r.name, r.description,
        ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)::geography, true,
        true, ${SCRAPED_SOURCE}, r.mapbox_id, r.geocode_accuracy, r.match_code, r.manual_override,
        case when r.manual_override then 'file' end, r.raw
      from jsonb_to_recordset(cast(${batch} as text)::jsonb) as r(
        "machineID" text, retailer text, address text, city text, state text, postal_code text,
        name text, description text, lng double precision, lat double precision,
        mapbox_id text, geocode_accuracy text, match_code jsonb, manual_override boolean, raw jsonb
      )`.execute(db)
  }
}

export interface MergeCounts {
  staged: number
  inserted: number
  updated: number
  unchanged: number
  /** Machines kept as database overrides whose values differ from the file's. */
  keptOverrides: number
}

/**
 * Upserts every staged machine into `locations` on "machineID", writing only
 * rows that change. A database override is kept unless the file overrides
 * that machine too.
 */
export async function mergeStaging(db: Db): Promise<MergeCounts> {
  // Identifiers only come from the column lists above; no input reaches sql.raw.
  const differs = (a: string, b: string) =>
    `(${DATA_COLUMNS.map((c) => comparable(a, c)).join(", ")}) is distinct from (${DATA_COLUMNS.map((c) => comparable(b, c)).join(", ")})`
  // One pass over the join: `desired` decides each row once, for both the
  // upsert and the kept-override count.
  const desiredColumns = MERGED_COLUMNS.map(
    (c) => `case when kept then cur_${c} else s_${c} end as ${q(c)}`,
  )
  const {
    rows: [counts],
  } = await sql<Omit<MergeCounts, "unchanged">>`${sql.raw(`
    with joined as (
      select s."machineID", ${keptOverride("cur", "s")} is true as kept,
        ${keptOverride("cur", "s")} is true and ${differs("cur", "s")} as kept_differs,
        ${MERGED_COLUMNS.map((c) => `cur.${q(c)} as ${q(`cur_${c}`)}, s.${q(c)} as ${q(`s_${c}`)}`).join(", ")}
      from location_import s
      left join locations cur using ("machineID")
    ),
    written as (
      insert into locations as l ("machineID", ${MERGED_COLUMNS.map(q).join(", ")}, updated_at)
      select "machineID", ${desiredColumns.join(", ")}, now()
      from joined
      on conflict ("machineID") do update set
        ${MERGED_COLUMNS.map((c) => `${q(c)} = excluded.${q(c)}`).join(", ")},
        updated_at = now()
      where (${MERGED_COLUMNS.map((c) => comparable("l", c)).join(", ")})
        is distinct from (${MERGED_COLUMNS.map((c) => comparable("excluded", c)).join(", ")})
      returning (xmax = 0) as inserted
    )
    select
      (select count(*)::int from joined) as staged,
      (select count(*)::int from written where inserted) as inserted,
      (select count(*)::int from written where not inserted) as updated,
      (select count(*)::int from joined where kept_differs) as "keptOverrides"`)}`.execute(db)

  const { staged, inserted, updated, keptOverrides } = counts
  return { staged, inserted, updated, unchanged: staged - inserted - updated, keptOverrides }
}

export interface VerifyReport {
  staged: number
  activeWithPosition: number
  /** Staged machines that aren't active with a position, other than kept database overrides. */
  inactive: string[]
  missing: string[]
  coordinateMismatches: string[]
  overridesInFile: number
  overridesFlagged: number
  /** Machines in the table that aren't in the file. Listed, never deleted. */
  extras: string[]
  problems: string[]
}

/** Checks `locations` now holds every staged machine as the file describes it. */
export async function verifyImport(db: Db): Promise<VerifyReport> {
  const kept = keptOverride("l", "s")
  const {
    rows: [r],
  } = await sql<Omit<VerifyReport, "problems">>`${sql.raw(`
    select
      (select count(*)::int from location_import) as "staged",
      (select count(*)::int from location_import s join locations l using ("machineID")
        where l.is_active and l.geog is not null) as "activeWithPosition",
      array(select s."machineID" from location_import s join locations l using ("machineID")
        where not ${kept} and not (l.is_active and l.geog is not null)
        order by 1) as "inactive",
      array(select s."machineID" from location_import s
        where not exists (select 1 from locations l where l."machineID" = s."machineID")
        order by 1) as "missing",
      array(select s."machineID" from location_import s join locations l using ("machineID")
        where not ${kept}
          and (abs(ST_X(l.geog::geometry) - ST_X(s.geog::geometry)) > 1e-6
            or abs(ST_Y(l.geog::geometry) - ST_Y(s.geog::geometry)) > 1e-6)
        order by 1) as "coordinateMismatches",
      (select count(*)::int from location_import where manual_override) as "overridesInFile",
      (select count(*)::int from location_import s join locations l using ("machineID")
        where s.manual_override and l.manual_override and l.manual_override_source = 'file') as "overridesFlagged",
      array(select l."machineID" from locations l
        where l."machineID" is not null
          and not exists (select 1 from location_import s where s."machineID" = l."machineID")
        order by 1) as "extras"`)}`.execute(db)

  const problems: string[] = []
  if (r.inactive.length) {
    problems.push(`${r.inactive.length} machines from the file aren't active with a position: ${preview(r.inactive)}`)
  }
  if (r.missing.length) problems.push(`${r.missing.length} machines from the file are missing: ${preview(r.missing)}`)
  if (r.coordinateMismatches.length) {
    problems.push(
      `${r.coordinateMismatches.length} machines differ from the file by more than 1e-6°: ${preview(r.coordinateMismatches)}`,
    )
  }
  if (r.overridesFlagged !== r.overridesInFile) {
    problems.push(`${r.overridesInFile} manual overrides in the file, but ${r.overridesFlagged} are flagged.`)
  }
  return { ...r, problems }
}

export const preview = (ids: string[], max = 20) =>
  ids.slice(0, max).join(", ") + (ids.length > max ? `, … (${ids.length - max} more)` : "")

// ─── Import ────────────────────────────────────────────────────────────────

export interface ImportReport {
  file: string
  total: number
  skipped: string[]
  warnings: string[]
  duplicates: string[]
  counts: MergeCounts
  verify: VerifyReport
}

/** Imports `file` using `db`, which must be a transaction. */
export async function importLocations(db: Kysely<unknown>, file = DEFAULT_FILE): Promise<ImportReport> {
  const source = readFeatureFile(file)
  await loadStaging(db, source.rows)
  const counts = await mergeStaging(db)
  const verify = await verifyImport(db)
  if (verify.problems.length) {
    throw new Error(`Location import verification failed, nothing written:\n  ${verify.problems.join("\n  ")}`)
  }
  const { skipped, warnings, duplicates, total } = source
  return { file: path.relative(ROOT_DIR, file), total, skipped, warnings, duplicates, counts, verify }
}

/** A few lines for the console. */
export function summarize(r: ImportReport): string[] {
  const { counts: c, verify: v } = r
  return [
    `Locations from ${r.file}: ${r.total} features, ${c.staged} usable.`,
    ...r.skipped.map((s) => `  skipped ${s}`),
    ...r.warnings.map((w) => `  warning: ${w}`),
    ...(r.duplicates.length ? [`  duplicate machineIDs (first kept): ${preview(r.duplicates)}`] : []),
    `${c.inserted} inserted, ${c.updated} updated, ${c.unchanged} unchanged; ` +
      `${c.keptOverrides} database overrides kept that differ from the file.`,
    `Verified: ${v.activeWithPosition}/${v.staged} active with a position, ` +
      `${v.overridesFlagged}/${v.overridesInFile} overrides flagged, coordinates match within 1e-6°.`,
    ...(v.extras.length ? [`${v.extras.length} machines in the table aren't in the file (left as is): ${preview(v.extras)}`] : []),
  ]
}

// ─── Command line ──────────────────────────────────────────────────────────

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  if (i === -1) return undefined
  const value = process.argv[i + 1]
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`)
  return value
}

async function main() {
  loadDevEnv()
  // Parse every flag first, so a bad one fails before anything is written.
  const file = argValue("--file") ?? DEFAULT_FILE
  const reportFile = argValue("--report")
  const apply = process.argv.includes("--apply")
  // The migrate workflow runs this on every deploy; once the JSON is gone (#80) there's nothing to do.
  if (file === DEFAULT_FILE && !existsSync(file)) {
    console.log(`No ${path.relative(ROOT_DIR, file)}; nothing to import.`)
    return
  }

  const sql = migrationClient()
  const { db } = createMigrator(sql)
  try {
    const run = (trx: Parameters<typeof importLocations>[0]) => importLocations(trx, file)
    const report = apply ? await db.transaction().execute(run) : await inRolledBackTransaction(db, run)
    for (const line of summarize(report)) console.log(line)
    if (reportFile) writeFileSync(reportFile, JSON.stringify({ apply, ...report }, null, 2) + "\n")
    console.log(apply ? "Done." : "Dry run: nothing written. Re-run with --apply to write.")
  } finally {
    await sql.end({ timeout: 5 })
  }
}

// Run only as a script, not when a test imports this file.
if (process.argv[1]?.endsWith("import-locations.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
