/**
 * Copies the machines in src/data/vending_machines_mod.json into `locations`
 * (#73). The JSON stays the app's source for now; this only fills the table.
 *
 *   npm run db:import-locations                    # dry run
 *   npm run db:import-locations -- --apply         # write
 *   npm run db:import-locations -- --file <geojson> --report <json>
 *
 * Everything runs in one transaction; a dry run rolls it back, so it prints
 * exactly what --apply would do. Upserts on "machineID" and only writes rows
 * that change, so a second run reports 0 inserted, 0 updated. The file's
 * `_manual_override` flags are copied to manual_override; a machine with
 * manual_override in the database keeps its values unless the file overrides
 * it too. Machines in the table but not in the file are listed, never deleted.
 *
 * Fails, writing nothing, if the verification after the merge finds a missing
 * machine, a coordinate more than 1e-6 degrees from the file, or an unflagged
 * override.
 */
import path from "node:path"
import { readFeatureFile } from "./locations/features"
import { loadStaging, mergeStaging, preview, verifyImport } from "./locations/merge"
import { argValue, hasFlag, inTransaction, runMain, writeReport } from "./locations/cli"
import { ROOT_DIR } from "./env"

const DEFAULT_FILE = path.join(ROOT_DIR, "src/data/vending_machines_mod.json")

async function main() {
  const file = argValue("--file") ?? DEFAULT_FILE
  const apply = hasFlag("--apply")

  const source = readFeatureFile(file)
  console.log(`${path.relative(process.cwd(), file)}: ${source.total} features, ${source.rows.length} usable.`)
  for (const reason of source.skipped) console.log(`  skipped ${reason}`)
  for (const warning of source.warnings) console.log(`  warning: ${warning}`)
  if (source.duplicates.length) console.log(`  duplicate machineIDs (first kept): ${preview(source.duplicates)}`)

  const report = await inTransaction(apply, async (tx) => {
    await loadStaging(tx, source.rows)
    const counts = await mergeStaging(tx)
    const verify = await verifyImport(tx)
    if (verify.problems.length) {
      throw new Error(`Verification failed, nothing written:\n  ${verify.problems.join("\n  ")}`)
    }
    return { counts, verify }
  })

  const { counts, verify } = report
  console.log(
    `${counts.inserted} inserted, ${counts.updated} updated, ${counts.unchanged} unchanged, ` +
      `${source.skipped.length} skipped, ${counts.keptOverrides} kept as manual overrides.`,
  )
  console.log(
    `Verified: ${verify.activeWithPosition}/${verify.staged} active with a position, ` +
      `${verify.overridesFlagged}/${verify.overridesInFile} overrides flagged, coordinates match within 1e-6°.`,
  )
  if (verify.extras.length) {
    console.log(`${verify.extras.length} machines in the table aren't in the file (left as is): ${preview(verify.extras)}`)
  }
  writeReport(argValue("--report"), { file, apply, total: source.total, skipped: source.skipped, ...report })
  console.log(apply ? "Done." : "Dry run: nothing written. Re-run with --apply to write.")
}

runMain(main)
