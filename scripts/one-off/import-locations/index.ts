/**
 * One-off: copies the machines in src/data/vending_machines_mod.json into
 * `locations` (#73). Migration 0002_import_locations runs it on every
 * database; `npm run db:import-locations` runs it by hand.
 *
 * Idempotent: it upserts on "machineID" and writes only rows that change, so
 * running it again (or after the weekly job updates the JSON) is safe. The
 * file's `_manual_override` flags are copied to manual_override, and a
 * database override is kept unless the file overrides that machine too.
 * Machines in the table but not in the file are listed, never deleted.
 *
 * Throws if the verification after the merge finds a missing machine, a
 * coordinate more than 1e-6 degrees from the file, or an unflagged override.
 * The caller's transaction then rolls back, so nothing is written.
 */
import path from "node:path"
import type { Kysely } from "kysely"
import { ROOT_DIR } from "../../db/env"
import { readFeatureFile } from "./features"
import { loadStaging, mergeStaging, preview, verifyImport, type MergeCounts, type VerifyReport } from "./merge"

export const DEFAULT_FILE = path.join(ROOT_DIR, "src/data/vending_machines_mod.json")

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
