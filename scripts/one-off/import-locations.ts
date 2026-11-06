/**
 * One-off: copies the machines in src/data/vending_machines_mod.json into
 * `locations` (#73).
 *
 * Migration 0002_import_locations runs it on every database. To run it by hand
 * (to pick up later edits to the JSON, or to preview):
 *
 *   npm run db:import-locations                    # dry run: rolled back
 *   npm run db:import-locations -- --apply         # write
 *   npm run db:import-locations -- --file <geojson> --report <json>
 *
 * How it works, all in one transaction (the migration's, or the CLI's):
 * 1. Parse: each GeoJSON feature becomes a row. Coordinates come from the
 *    geometry first (what the map draws, and where hand corrections were
 *    saved), then `properties.coordinates`.
 * 2. Load the rows into `locations_staging`.
 * 3. Merge into `locations` on "machineID", writing only rows that change, so
 *    running it again writes nothing. `_manual_override` becomes
 *    manual_override; a database override is kept unless the file overrides
 *    that machine too. Machines in the table but not in the file are listed,
 *    never deleted.
 * 4. Verify every machine is present, active, within 1e-6 degrees of the file
 *    and flagged when overridden. Otherwise throw, so nothing is written.
 *
 * Table names are unqualified, so they follow search_path.
 */
import { readFileSync, writeFileSync } from "node:fs"
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

// ─── Stage, merge, verify ──────────────────────────────────────────────────

const BATCH_SIZE = 500

/** Columns the merge owns. Everything else (id, created_by, created_at) is left alone. */
const MERGED_COLUMNS = [
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
  "manual_override",
  "raw",
]

const q = (column: string) => `"${column}"`
/** geography has no reliable equality; compare its binary form. */
const comparable = (prefix: string, column: string) =>
  column === "geog" ? `ST_AsEWKB(${prefix}.geog::geometry)` : `${prefix}.${q(column)}`

/** Replaces the contents of locations_staging with `rows`. */
export async function loadStaging(db: Db, rows: LocationRow[]): Promise<void> {
  await sql`truncate locations_staging`.execute(db)
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    // Sent as text and cast, so the driver can't encode the JSON twice.
    const batch = JSON.stringify(rows.slice(i, i + BATCH_SIZE))
    await sql`
      insert into locations_staging (
        "machineID", retailer, address, city, state, postal_code, name, description,
        geog, is_official, is_active, source, mapbox_id, geocode_accuracy, match_code, manual_override, raw
      )
      select
        r."machineID", r.retailer, r.address, r.city, r.state, r.postal_code, r.name, r.description,
        ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)::geography,
        true, true, ${SCRAPED_SOURCE}, r.mapbox_id, r.geocode_accuracy, r.match_code, r.manual_override, r.raw
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
  /** Rows the file would have changed but that have manual_override in the database. */
  keptOverrides: number
}

/**
 * Upserts every staged machine into `locations` on "machineID", writing only
 * rows that change. A database override is kept unless the file overrides
 * that machine too.
 */
export async function mergeStaging(db: Db): Promise<MergeCounts> {
  const {
    rows: [{ staged, kept }],
  } = await sql<{ staged: number; kept: number }>`
    select
      (select count(*)::int from locations_staging) as staged,
      (select count(*)::int from locations_staging s join locations l using ("machineID")
        where l.manual_override and not s.manual_override) as kept`.execute(db)

  const keep = `(cur."machineID" is not null and cur.manual_override and not s.manual_override)`
  const desired = MERGED_COLUMNS.map((c) => `case when ${keep} then cur.${q(c)} else s.${q(c)} end as ${q(c)}`)
  // Identifiers only come from MERGED_COLUMNS above; no input reaches sql.raw.
  const { rows } = await sql<{ inserted: boolean }>`${sql.raw(`
    insert into locations as l ("machineID", ${MERGED_COLUMNS.map(q).join(", ")}, updated_at)
    select s."machineID", ${desired.join(", ")}, now()
    from locations_staging s
    left join locations cur using ("machineID")
    on conflict ("machineID") do update set
      ${MERGED_COLUMNS.map((c) => `${q(c)} = excluded.${q(c)}`).join(", ")},
      updated_at = now()
    where (${MERGED_COLUMNS.map((c) => comparable("l", c)).join(", ")})
      is distinct from (${MERGED_COLUMNS.map((c) => comparable("excluded", c)).join(", ")})
    returning (xmax = 0) as inserted`)}`.execute(db)

  const inserted = rows.filter((r) => r.inserted).length
  return { staged, inserted, updated: rows.length - inserted, unchanged: staged - rows.length, keptOverrides: kept }
}

export interface VerifyReport {
  staged: number
  activeWithPosition: number
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
  const {
    rows: [r],
  } = await sql<Omit<VerifyReport, "problems">>`
    select
      (select count(*)::int from locations_staging) as "staged",
      (select count(*)::int from locations_staging s join locations l using ("machineID")
        where l.is_active and l.geog is not null) as "activeWithPosition",
      array(select s."machineID" from locations_staging s
        where not exists (select 1 from locations l where l."machineID" = s."machineID")
        order by 1) as "missing",
      array(select s."machineID" from locations_staging s join locations l using ("machineID")
        where (not l.manual_override or s.manual_override)
          and (abs(ST_X(l.geog::geometry) - ST_X(s.geog::geometry)) > 1e-6
            or abs(ST_Y(l.geog::geometry) - ST_Y(s.geog::geometry)) > 1e-6)
        order by 1) as "coordinateMismatches",
      (select count(*)::int from locations_staging where manual_override) as "overridesInFile",
      (select count(*)::int from locations_staging s join locations l using ("machineID")
        where s.manual_override and l.manual_override) as "overridesFlagged",
      array(select l."machineID" from locations l
        where l."machineID" is not null
          and not exists (select 1 from locations_staging s where s."machineID" = l."machineID")
        order by 1) as "extras"`.execute(db)

  const problems: string[] = []
  if (r.activeWithPosition !== r.staged) {
    problems.push(`${r.staged} machines in the file, but ${r.activeWithPosition} of them are active with a position.`)
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
    `${c.inserted} inserted, ${c.updated} updated, ${c.unchanged} unchanged, ${c.keptOverrides} kept as manual overrides.`,
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
  const file = argValue("--file") ?? DEFAULT_FILE
  const apply = process.argv.includes("--apply")

  const sql = migrationClient()
  const { db } = createMigrator(sql)
  try {
    const run = (trx: Parameters<typeof importLocations>[0]) => importLocations(trx, file)
    const report = apply ? await db.transaction().execute(run) : await inRolledBackTransaction(db, run)
    for (const line of summarize(report)) console.log(line)
    const reportFile = argValue("--report")
    if (reportFile) writeFileSync(reportFile, JSON.stringify({ apply, ...report }, null, 2) + "\n")
    console.log(apply ? "Done." : "Dry run: nothing written. Re-run with --apply to write.")
  } finally {
    await sql.end({ timeout: 5 })
  }
}

// Run only as a script, not when the migration or a test imports this file.
if (process.argv[1]?.endsWith("import-locations.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
