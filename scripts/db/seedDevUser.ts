/**
 * A ready-to-use account for local development, so you can log in without
 * signing up and confirming an email:
 *
 *   email     dev@pokefindr.local
 *   password  pokefindr-dev-password!
 *
 * Only ever added to a local database (localhost, or the `db` container):
 * never to staging or production, whatever DATABASE_URL says.
 */
import type postgres from "postgres"
import { hashPassword } from "better-auth/crypto"

export const DEV_USER = {
  id: "00000000-0000-4000-8000-00000000de70",
  email: "dev@pokefindr.local",
  password: "pokefindr-dev-password!",
  name: "Dev User",
  username: "dev",
} as const

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "db"])

/** Whether a connection string points at this machine or the local stack's database. */
export function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return false
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Adds the dev user if it's missing. Returns whether it was added. Safe to run again. */
export async function seedDevUser(sql: postgres.Sql): Promise<boolean> {
  const [existing] = await sql`select 1 from users where id = ${DEV_USER.id} or email = ${DEV_USER.email}`
  if (existing) return false
  const hash = await hashPassword(DEV_USER.password)
  await sql.begin(async (tx) => {
    await tx`insert into users (id, name, email, email_verified) values (${DEV_USER.id}, ${DEV_USER.name}, ${DEV_USER.email}, true)`
    await tx`insert into accounts (user_id, provider_id, account_id, password) values (${DEV_USER.id}, 'credential', ${DEV_USER.id}, ${hash})`
    await tx`insert into profiles (id, username, full_name, onboarded) values (${DEV_USER.id}, ${DEV_USER.username}, ${DEV_USER.name}, true) on conflict do nothing`
  })
  return true
}
