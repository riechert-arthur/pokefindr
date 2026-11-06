/** Argument parsing and the dry-run transaction for import-locations.ts. */
import { writeFileSync } from "node:fs"
import type postgres from "postgres"
import { loadDevEnv, migrationClient } from "../env"

export function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  if (i === -1) return undefined
  const value = process.argv[i + 1]
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`)
  return value
}

export const hasFlag = (flag: string) => process.argv.includes(flag)

class DryRun<T> extends Error {
  constructor(readonly result: T) {
    super("dry run")
  }
}

/**
 * Runs `work` in one transaction on the migration (direct) connection.
 * Without `apply` the transaction is rolled back, so a dry run reports exactly
 * what `--apply` would do. `work` throws to abort either way.
 */
export async function inTransaction<T>(apply: boolean, work: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  loadDevEnv()
  const sql = migrationClient()
  try {
    return (await sql.begin(async (tx) => {
      const result = await work(tx)
      if (!apply) throw new DryRun(result)
      return result
    })) as T
  } catch (err) {
    if (err instanceof DryRun) return err.result as T
    throw err
  } finally {
    await sql.end({ timeout: 5 })
  }
}

export function writeReport(file: string | undefined, report: unknown) {
  if (file) writeFileSync(file, JSON.stringify(report, null, 2) + "\n")
}

export function runMain(main: () => Promise<void>) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
