/**
 * Imports the card shops in src/data/osm_card_shops.json (from OpenStreetMap,
 * written by `npm run db:fetch-osm-shops`) into `locations` (#397).
 *
 * Not a migration, like the location import: the migrate workflow runs it with
 * --apply after `db:migrate`, in its own transaction, so it never holds the
 * migrations' locks and `db:baseline` never replays it.
 *
 *   npm run db:import-osm-shops                        # dry run: rolled back
 *   npm run db:import-osm-shops -- --dry-run           # the same, said explicitly
 *   npm run db:import-osm-shops -- --apply             # write
 *   npm run db:import-osm-shops -- --report <json>     # also write the report
 *   npm run db:import-osm-shops -- --rollback <run id> [--dry-run | --apply]
 *
 * In one transaction:
 * - A shop whose OSM id (`locations.external_id`, source 'osm') isn't in the
 *   table yet is inserted, with its `card_shop_details`, unless a shop from
 *   another source (a submission, the seed) is within 75 m with a similar
 *   name: that's listed as a probable duplicate for a person to merge.
 * - A shop already imported is updated when its OSM data changed. One an
 *   admin hid (hidden_at) stays hidden.
 * - An imported shop no longer in the snapshot is deactivated, never
 *   deleted: reviews may point at it.
 * Every change is logged in `location_import_changes` under one
 * `location_import_runs` row, so `--rollback <run id>` can undo the run alone.
 * A run that changes nothing records nothing, so every deploy can run it.
 *
 * The data is © OpenStreetMap contributors, under the ODbL (docs/database.md).
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { sql, type Kysely } from "kysely"
import { OSM_SOURCE, type OsmShop } from "@/lib/osm/card-shops"
import { loadDevEnv, migrationClient, ROOT_DIR } from "../db/env"
import { createMigrator, inRolledBackTransaction } from "../db/migrator"

type Db = Kysely<unknown>

export const SNAPSHOT_FILE = path.join(ROOT_DIR, "src/data/osm_card_shops.json")
/** A shop from another source this close, with a similar name, is probably the same shop. */
export const DUPLICATE_METERS = 75
const BATCH_SIZE = 500

export interface Snapshot {
  fetchedAt: string
  shops: OsmShop[]
}

export function readSnapshot(file = SNAPSHOT_FILE): { snapshot: Snapshot; hash: string } {
  const text = readFileSync(file, "utf8")
  return { snapshot: JSON.parse(text) as Snapshot, hash: createHash("sha256").update(text).digest("hex") }
}

// ─── A shop's values ───────────────────────────────────────────────────────

/** What the import writes for a shop: logged before and after each change, and restored by a rollback. */
export interface ShopValues {
  name: string | null
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  lng: number | null
  lat: number | null
  is_active: boolean
  website: string | null
  hours: string | null
  raw: unknown
}

const valuesOf = (shop: OsmShop, active: boolean): ShopValues => ({
  name: shop.name,
  address: shop.address,
  city: shop.city,
  state: shop.state,
  postal_code: shop.postalCode,
  lng: shop.lng,
  lat: shop.lat,
  is_active: active,
  website: shop.website,
  hours: shop.hours,
  raw: shop.tags,
})

/** Keys sorted (jsonb doesn't keep their order) and positions to 1e-7°, so the same values compare equal. */
function canonical(v: unknown): unknown {
  if (typeof v === "number") return Math.round(v * 1e7) / 1e7
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]))
  return v
}
export const sameValues = (a: ShopValues, b: ShopValues) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

interface Current extends ShopValues {
  id: string
  external_id: string
  hidden: boolean
}

/** The imported shops now in the table, with their details, by OSM id (or by location id). */
async function currentShops(db: Db, ids?: string[]): Promise<Current[]> {
  if (ids && !ids.length) return []
  const { rows } = await sql<Current>`
    select l.id, l.external_id, l.name, l.address, l.city, l.state, l.postal_code,
      ST_X(l.geog::geometry) as lng, ST_Y(l.geog::geometry) as lat, l.is_active,
      l.hidden_at is not null as hidden, d.website, d.hours, l.raw
    from locations l left join card_shop_details d on d.location_id = l.id
    where l.source = ${OSM_SOURCE} and l.external_id is not null
      ${ids ? sql`and l.id in (${sql.join(ids.map((id) => sql`${id}::uuid`))})` : sql``}`.execute(db)
  return rows
}

const pick = ({ name, address, city, state, postal_code, lng, lat, is_active, website, hours, raw }: ShopValues): ShopValues => ({
  name, address, city, state, postal_code, lng, lat, is_active, website, hours, raw,
})

// ─── Writes ────────────────────────────────────────────────────────────────

/** `jsonb_to_recordset`'s column list for ShopValues rows keyed by `id` or `external_id`. */
const VALUE_COLUMNS = sql`name text, address text, city text, state text, postal_code text, lng double precision, lat double precision, is_active boolean, website text, hours text, raw jsonb`

const chunks = <T>(list: T[]) => Array.from({ length: Math.ceil(list.length / BATCH_SIZE) }, (_, i) => list.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE))

/** Inserts the shops with their details; returns each new row's id by OSM id. */
async function insertShops(db: Db, rows: (ShopValues & { external_id: string })[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  for (const batch of chunks(rows)) {
    // Sent as text and cast, so the driver can't encode the JSON twice.
    const json = JSON.stringify(batch)
    const { rows: inserted } = await sql<{ id: string; external_id: string }>`
      insert into locations (kind, source, external_id, name, address, city, state, postal_code, geog, is_official, is_active, country_code, raw)
      select 'shop', ${OSM_SOURCE}, r.external_id, r.name, r.address, r.city, r.state, r.postal_code,
        ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)::geography, false, r.is_active, 'US', r.raw
      from jsonb_to_recordset(cast(${json} as text)::jsonb) as r(external_id text, ${VALUE_COLUMNS})
      returning id, external_id`.execute(db)
    for (const r of inserted) ids.set(r.external_id, r.id)
    await sql`
      insert into card_shop_details (location_id, website, hours, sells)
      select l.id, r.website, r.hours, '{}'
      from jsonb_to_recordset(cast(${json} as text)::jsonb) as r(external_id text, ${VALUE_COLUMNS})
      join locations l on l.source = ${OSM_SOURCE} and l.external_id = r.external_id`.execute(db)
  }
  return ids
}

/** Writes each row's values over the location with its `id`, details included. */
async function writeValues(db: Db, rows: (ShopValues & { id: string })[]): Promise<void> {
  for (const batch of chunks(rows)) {
    const json = JSON.stringify(batch)
    await sql`
      update locations l set name = r.name, address = r.address, city = r.city, state = r.state, postal_code = r.postal_code,
        geog = ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)::geography, is_active = r.is_active, raw = r.raw
      from jsonb_to_recordset(cast(${json} as text)::jsonb) as r(id uuid, ${VALUE_COLUMNS})
      where l.id = r.id`.execute(db)
    await sql`
      insert into card_shop_details (location_id, website, hours, sells)
      select r.id, r.website, r.hours, '{}'
      from jsonb_to_recordset(cast(${json} as text)::jsonb) as r(id uuid, ${VALUE_COLUMNS})
      on conflict (location_id) do update set website = excluded.website, hours = excluded.hours`.execute(db)
  }
}

interface Change {
  location_id: string
  op: "insert" | "update" | "deactivate"
  before: ShopValues | null
  after: ShopValues
}

async function logChanges(db: Db, runId: string, changes: Change[]): Promise<void> {
  for (const batch of chunks(changes)) {
    await sql`
      insert into location_import_changes (run_id, location_id, op, before, after)
      select ${runId}::uuid, r.location_id, r.op, r.before, r.after
      from jsonb_to_recordset(cast(${JSON.stringify(batch)} as text)::jsonb) as r(location_id uuid, op text, before jsonb, after jsonb)`.execute(db)
  }
}

// ─── Import ────────────────────────────────────────────────────────────────

export interface ImportReport {
  file: string
  fetchedAt: string
  shops: number
  /** The run that recorded the changes, or null when nothing changed. */
  runId: string | null
  inserted: number
  updated: number
  deactivated: number
  unchanged: number
  /** Kept hidden: an admin hid them, whatever OSM says. */
  hidden: number
  /** Not inserted: a shop from another source is within DUPLICATE_METERS with a similar name. */
  duplicates: { externalId: string; name: string; existingId: string; existingName: string }[]
  /** Deactivated: no longer in the snapshot. */
  gone: string[]
}

/** Shops from other sources that are probably these new ones. */
async function probableDuplicates(db: Db, shops: OsmShop[]): Promise<ImportReport["duplicates"]> {
  const found: ImportReport["duplicates"] = []
  // Letters and digits only, lowercased: "Dave & Adam's NYC" → "daveadamsnyc".
  const norm = (col: ReturnType<typeof sql.ref>) => sql`regexp_replace(lower(${col}), '[^a-z0-9]', '', 'g')`
  for (const batch of chunks(shops)) {
    const json = JSON.stringify(batch.map((s) => ({ external_id: s.externalId, name: s.name, lng: s.lng, lat: s.lat })))
    const { rows } = await sql<ImportReport["duplicates"][number]>`
      select distinct on (n.external_id) n.external_id as "externalId", n.name, l.id as "existingId", l.name as "existingName"
      from jsonb_to_recordset(cast(${json} as text)::jsonb) as n(external_id text, name text, lng double precision, lat double precision)
      join locations l on l.kind = 'shop' and l.is_active and l.source is distinct from ${OSM_SOURCE}
        and ST_DWithin(l.geog, ST_SetSRID(ST_MakePoint(n.lng, n.lat), 4326)::geography, ${DUPLICATE_METERS})
      where ${norm(sql.ref("l.name"))} <> '' and ${norm(sql.ref("n.name"))} <> ''
        and (${norm(sql.ref("l.name"))} like '%' || ${norm(sql.ref("n.name"))} || '%'
          or ${norm(sql.ref("n.name"))} like '%' || ${norm(sql.ref("l.name"))} || '%')
      order by n.external_id, ST_Distance(l.geog, ST_SetSRID(ST_MakePoint(n.lng, n.lat), 4326)::geography)`.execute(db)
    found.push(...rows)
  }
  return found
}

/** Imports `file` using `db`, which must be a transaction. */
export async function importOsmShops(db: Db, file = SNAPSHOT_FILE): Promise<ImportReport> {
  if (!db.isTransaction) throw new Error("importOsmShops needs a transaction")
  const { snapshot, hash } = readSnapshot(file)
  const existing = new Map((await currentShops(db)).map((c) => [c.external_id, c]))

  const fresh = snapshot.shops.filter((s) => !existing.has(s.externalId))
  const duplicates = await probableDuplicates(db, fresh)
  const skipped = new Set(duplicates.map((d) => d.externalId))

  const changes: Change[] = []
  const updates: (ShopValues & { id: string })[] = []
  let hidden = 0
  let unchanged = 0
  for (const shop of snapshot.shops) {
    const cur = existing.get(shop.externalId)
    if (!cur) continue
    if (cur.hidden) hidden++
    const after = valuesOf(shop, !cur.hidden)
    if (sameValues(pick(cur), after)) {
      unchanged++
      continue
    }
    updates.push({ ...after, id: cur.id })
    changes.push({ location_id: cur.id, op: "update", before: pick(cur), after })
  }

  const inSnapshot = new Set(snapshot.shops.map((s) => s.externalId))
  const gone = [...existing.values()].filter((c) => c.is_active && !inSnapshot.has(c.external_id))
  for (const c of gone) {
    const after = { ...pick(c), is_active: false }
    updates.push({ ...after, id: c.id })
    changes.push({ location_id: c.id, op: "deactivate", before: pick(c), after })
  }

  const toInsert = fresh.filter((s) => !skipped.has(s.externalId)).map((s) => ({ ...valuesOf(s, true), external_id: s.externalId }))
  const ids = await insertShops(db, toInsert)
  for (const row of toInsert) {
    const { external_id, ...after } = row
    changes.push({ location_id: ids.get(external_id)!, op: "insert", before: null, after })
  }
  await writeValues(db, updates)

  const counts = { inserted: toInsert.length, updated: changes.filter((c) => c.op === "update").length, deactivated: gone.length }
  let runId: string | null = null
  if (changes.length) {
    const {
      rows: [run],
    } = await sql<{ id: string }>`
      insert into location_import_runs (source, snapshot_hash, fetched_at, counts)
      values (${OSM_SOURCE}, ${hash}, ${snapshot.fetchedAt}, ${JSON.stringify(counts)}::jsonb)
      returning id`.execute(db)
    runId = run.id
    await logChanges(db, runId, changes)
  }

  await verify(db, snapshot, skipped)
  return {
    file: path.relative(ROOT_DIR, file),
    fetchedAt: snapshot.fetchedAt,
    shops: snapshot.shops.length,
    runId,
    ...counts,
    unchanged,
    hidden,
    duplicates,
    gone: gone.map((c) => c.external_id),
  }
}

/** Every shop in the snapshot (probable duplicates aside) is in the table as the snapshot says. Otherwise throws. */
async function verify(db: Db, snapshot: Snapshot, skipped: Set<string>): Promise<void> {
  const rows = new Map((await currentShops(db)).map((c) => [c.external_id, c]))
  const problems: string[] = []
  for (const shop of snapshot.shops) {
    if (skipped.has(shop.externalId)) continue
    const cur = rows.get(shop.externalId)
    if (!cur) problems.push(`${shop.externalId} is missing`)
    else if (!sameValues(pick(cur), valuesOf(shop, !cur.hidden))) problems.push(`${shop.externalId} doesn't match the snapshot`)
  }
  if (problems.length) {
    throw new Error(`OSM shop import verification failed, nothing written:\n  ${problems.slice(0, 20).join("\n  ")}${problems.length > 20 ? `\n  … (${problems.length - 20} more)` : ""}`)
  }
}

export function summarize(r: ImportReport, apply = true): string[] {
  return [
    `Card shops from ${r.file} (OpenStreetMap, fetched ${r.fetchedAt}): ${r.shops}.`,
    `${r.inserted} inserted, ${r.updated} updated, ${r.deactivated} deactivated (gone from OSM), ${r.unchanged} unchanged; ${r.hidden} kept hidden.`,
    ...(r.duplicates.length ? [`${r.duplicates.length} not inserted, probably already here: ${r.duplicates.slice(0, 10).map((d) => `${d.name} (${d.externalId}) ≈ ${d.existingName}`).join("; ")}${r.duplicates.length > 10 ? "; …" : ""}`] : []),
    !r.runId ? "Nothing changed; no run recorded." : apply ? `Logged as run ${r.runId} (roll back with --rollback ${r.runId}).` : "With --apply, these changes are logged as one run that can be rolled back.",
  ]
}

// ─── Rollback ──────────────────────────────────────────────────────────────

export interface RollbackReport {
  runId: string
  restored: number
  deleted: number
  /** Inserted rows that gained reviews, reports or highlights since: deactivated instead of deleted. */
  deactivated: number
  /** Changed since the run (an admin's edit, a later import): left as they are. */
  skipped: string[]
}

/** Undoes run `runId`, which must be the latest run not rolled back, using `db` (a transaction). */
export async function rollbackRun(db: Db, runId: string): Promise<RollbackReport> {
  if (!db.isTransaction) throw new Error("rollbackRun needs a transaction")
  const { rows: runs } = await sql<{ id: string; rolled_back_at: Date | null }>`
    select id, rolled_back_at from location_import_runs where source = ${OSM_SOURCE} and rolled_back_at is null
    order by applied_at desc, id desc`.execute(db)
  const {
    rows: [run],
  } = await sql<{ id: string; rolled_back_at: Date | null }>`select id, rolled_back_at from location_import_runs where id = ${runId}::uuid and source = ${OSM_SOURCE}`.execute(db)
  if (!run) throw new Error(`No OSM shop import run ${runId}.`)
  if (run.rolled_back_at) return { runId, restored: 0, deleted: 0, deactivated: 0, skipped: [] }
  if (runs[0]?.id !== runId) throw new Error(`Run ${runId} isn't the latest: roll back ${runs[0].id} first.`)

  const { rows: changes } = await sql<Change & { id: string }>`
    select id, location_id, op, before, after from location_import_changes where run_id = ${runId}::uuid order by id desc`.execute(db)
  const current = new Map((await currentShops(db, changes.map((c) => c.location_id))).map((c) => [c.id, c]))
  const { rows: used } = await sql<{ id: string }>`
    select distinct location_id as id from (
      select location_id from location_ratings union all select location_id from status_reports
      union all select location_id from highlights union all select location_id from report_actions
    ) u where location_id in (${sql.join(changes.length ? changes.map((c) => sql`${c.location_id}::uuid`) : [sql`null`])})`.execute(db)
  const referenced = new Set(used.map((u) => u.id))

  const report: RollbackReport = { runId, restored: 0, deleted: 0, deactivated: 0, skipped: [] }
  const restore: (ShopValues & { id: string })[] = []
  const remove: string[] = []
  for (const c of changes) {
    const cur = current.get(c.location_id)
    if (!cur) continue // already gone
    if (!sameValues(pick(cur), c.after)) {
      report.skipped.push(cur.external_id)
      continue
    }
    if (c.op === "insert") {
      if (referenced.has(c.location_id)) {
        restore.push({ ...c.after, is_active: false, id: c.location_id })
        report.deactivated++
      } else {
        remove.push(c.location_id)
        report.deleted++
      }
    } else {
      restore.push({ ...c.before!, id: c.location_id })
      report.restored++
    }
  }
  await writeValues(db, restore)
  if (remove.length) await sql`delete from locations where id in (${sql.join(remove.map((id) => sql`${id}::uuid`))})`.execute(db)
  await sql`update location_import_runs set rolled_back_at = now() where id = ${runId}::uuid`.execute(db)
  return report
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
  const file = argValue("--file") ?? SNAPSHOT_FILE
  const reportFile = argValue("--report")
  const rollback = argValue("--rollback")
  const apply = process.argv.includes("--apply")
  if (apply && process.argv.includes("--dry-run")) throw new Error("--dry-run and --apply contradict each other; pass one.")
  if (!rollback && !existsSync(file)) {
    console.log(`No ${path.relative(ROOT_DIR, file)}; nothing to import.`)
    return
  }

  const client = migrationClient()
  const { db } = createMigrator(client)
  try {
    const run = (trx: Db): Promise<ImportReport | RollbackReport> => (rollback ? rollbackRun(trx, rollback) : importOsmShops(trx, file))
    const report = apply ? await db.transaction().execute(run) : await inRolledBackTransaction(db, run)
    if ("restored" in report) {
      const r = report as RollbackReport
      console.log(`Rollback of ${r.runId}: ${r.restored} restored, ${r.deleted} deleted, ${r.deactivated} deactivated (in use since).`)
      if (r.skipped.length) console.log(`${r.skipped.length} changed since the run, left as they are: ${r.skipped.slice(0, 20).join(", ")}`)
      console.log("If the snapshot that run imported is still committed, revert it too, or the next deploy imports it again.")
    } else {
      for (const line of summarize(report as ImportReport, apply)) console.log(line)
    }
    if (reportFile) writeFileSync(reportFile, JSON.stringify({ apply, ...report }, null, 2) + "\n")
    if (apply) {
      // The zoomed-out map's per-state counts, as after the location import.
      await sql`refresh materialized view concurrently location_region_counts`.execute(db)
      console.log("Refreshed location_region_counts.")
    }
    console.log(apply ? "Done." : "Dry run: nothing written. Re-run with --apply to write.")
  } finally {
    await client.end({ timeout: 5 })
  }
}

// Run only as a script, not when a test imports this file.
if (process.argv[1]?.endsWith("import-osm-shops.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
