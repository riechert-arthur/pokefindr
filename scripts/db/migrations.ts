/**
 * Helpers shared by drizzle.config.ts, the db:* scripts and their tests:
 * env loading, the migration connection URL, and reading drizzle-kit's journal
 * and snapshots.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { loadEnvConfig } from "@next/env"
import type { Snapshot } from "./schemaCheck"

const ROOT_DIR = path.resolve(__dirname, "../..")
export const MIGRATIONS_DIR = path.join(ROOT_DIR, "drizzle")

/**
 * Loads .env files the way `next dev` does (.env.development.local, .env.local,
 * .env.development, .env). Never loads .env.production*, so a pulled production
 * URL can't be picked up by accident. Variables already set in the shell win.
 */
export function loadDevEnv() {
  loadEnvConfig(ROOT_DIR, true)
}

/** Migrations need a direct connection; poolers in transaction mode can break DDL. */
export function migrationDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
}

export interface JournalEntry {
  idx: number
  when: number
  tag: string
}

export function readJournal(dir = MIGRATIONS_DIR): JournalEntry[] {
  const journal = JSON.parse(readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as {
    entries: JournalEntry[]
  }
  return journal.entries
}

/** Loads the snapshot for a migration tag (default: the latest migration). */
export function loadSnapshot(tag?: string): Snapshot {
  const entries = readJournal()
  const entry = tag ? entries.find((e) => e.tag === tag) : entries.at(-1)
  if (!entry) throw new Error(tag ? `${tag} not found in the migration journal` : "The migration journal is empty")
  // drizzle-kit names snapshots by the tag's numeric prefix: 0000_baseline -> 0000_snapshot.json
  const file = `${entry.tag.split("_")[0]}_snapshot.json`
  return JSON.parse(readFileSync(path.join(MIGRATIONS_DIR, "meta", file), "utf8")) as Snapshot
}
