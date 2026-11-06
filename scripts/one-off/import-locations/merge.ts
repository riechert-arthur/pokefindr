/**
 * Loads parsed rows into `locations_staging`, merges them into `locations`,
 * and checks the result. Every function takes a Kysely transaction (the
 * migration's, or the CLI's), so the whole import commits or rolls back as one.
 *
 * The file is the truth, including its manual overrides. The merge only
 * writes rows whose values change, so re-running with the same input writes
 * nothing. Table names are unqualified, so they follow search_path.
 */
import { sql, type Kysely } from "kysely"
import { SCRAPED_SOURCE, type LocationRow } from "./features"

type Db = Kysely<unknown>

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
