import path from "node:path"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { testDatabaseUrl } from "./testDatabase"

/** Recreates the test database from scratch and applies every migration. */
export default async function setup() {
  const url = testDatabaseUrl()
  const dbName = new URL(url).pathname.slice(1)

  const adminUrl = new URL(url)
  adminUrl.pathname = "/postgres"
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`drop database if exists "${dbName}" with (force)`)
    await admin.unsafe(`create database "${dbName}"`)
  } catch (err) {
    throw new Error(
      `Could not reach Postgres at ${adminUrl.host}. Start it with \`npm run db:up\`.\n${String(err)}`,
    )
  } finally {
    await admin.end({ timeout: 5 })
  }

  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, "../../drizzle") })
  } finally {
    await client.end({ timeout: 5 })
  }
}
