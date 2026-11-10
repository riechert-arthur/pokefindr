/**
 * Ready-to-use accounts for local development, so you can log in as each role
 * without signing up and confirming an email. They all share one password:
 *
 *   password  pokefindr-dev-password!
 *
 * Only ever added to a local database (localhost, or the `db` container):
 * never to staging or production, whatever DATABASE_URL says.
 */
import type postgres from "postgres"
import { hashPassword } from "better-auth/crypto"
import type { Role } from "@/lib/auth/roles"
import type { Locale } from "@/i18n/routing"

export const DEV_PASSWORD = "pokefindr-dev-password!"

export type DevAccount = {
  /** Fixed, so tests and bookmarks can rely on it. */
  id: string
  email: string
  username: string
  name: string
  /** Set again on every seed, so a seeded account always means the same thing. */
  role: Role
  /** The language its emails and pages use; null leaves it to the browser. */
  locale?: Locale | null
}

/** Every seeded account. Add one here to seed it; see docs/auth.md, "Local development". */
export const DEV_ACCOUNTS = [
  { id: "00000000-0000-4000-8000-00000000de70", email: "dev@pokefindr.local", username: "dev", name: "Dev User", role: "admin" },
  { id: "00000000-0000-4000-8000-0000000000d1", email: "moderator@pokefindr.local", username: "moderator", name: "Dev Moderator", role: "moderator" },
  // Ordinary members, so moderators and admins have other people's submissions and reports to act on.
  { id: "00000000-0000-4000-8000-0000000000a1", email: "ash@pokefindr.local", username: "ash", name: "Ash Ketchum", role: "member" },
  { id: "00000000-0000-4000-8000-0000000000a2", email: "misty@pokefindr.local", username: "misty", name: "Misty Waterflower", role: "member" },
  { id: "00000000-0000-4000-8000-0000000000a3", email: "brock@pokefindr.local", username: "brock", name: "Brock Harrison", role: "member" },
  // Emails and pages in Spanish.
  { id: "00000000-0000-4000-8000-0000000000a4", email: "serena@pokefindr.local", username: "serena", name: "Serena Yvonne", role: "member", locale: "es" },
] as const satisfies readonly DevAccount[]

export const DEV_USER = DEV_ACCOUNTS[0]

/** The seeded account with this email. A typo, or an account renamed in the list, fails typecheck. */
export function devAccount(email: (typeof DEV_ACCOUNTS)[number]["email"]): DevAccount {
  const account = DEV_ACCOUNTS.find((a) => a.email === email)
  if (!account) throw new Error(`No dev account ${email}`)
  return account
}

export const DEV_MODERATOR = devAccount("moderator@pokefindr.local")

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

/**
 * What seeding did to one account: added it, added the profile an older seed
 * left out, put its role back, left it alone, or skipped it because someone
 * signed up with its username or email (their account is left as it is).
 */
export type SeedOutcome = "added" | "profile added" | "role reset" | "unchanged" | "username taken" | "email taken"

/**
 * Adds each missing account (user, credential account, onboarded profile) and
 * sets an existing one's role back to the seeded value. Accounts are matched
 * by their fixed id only, so an account someone signed up with by hand is
 * never changed. Safe to run again: a second run reports every account
 * unchanged.
 */
export async function seedDevUsers(
  sql: postgres.Sql,
  accounts: readonly DevAccount[] = DEV_ACCOUNTS,
): Promise<{ account: DevAccount; outcome: SeedOutcome }[]> {
  let hash: string | undefined
  const results: { account: DevAccount; outcome: SeedOutcome }[] = []
  for (const account of accounts) {
    const [user] = await sql`select 1 from users where id = ${account.id}`
    const [profile] = await sql<{ role: Role }[]>`select role from profiles where id = ${account.id}`
    if (profile) {
      const changed = await sql`update profiles set role = ${account.role} where id = ${account.id} and role <> ${account.role}`
      results.push({ account, outcome: changed.count > 0 ? "role reset" : "unchanged" })
      continue
    }
    if (!user) {
      const [taken] = await sql`select 1 from users where lower(email) = lower(${account.email})`
      if (taken) {
        results.push({ account, outcome: "email taken" })
        continue
      }
    }
    // Checked first, as the unique index on lower(username) would otherwise fail the whole seed.
    const [taken] = await sql`select 1 from profiles where lower(username) = lower(${account.username})`
    if (taken) {
      results.push({ account, outcome: "username taken" })
      continue
    }
    const passwordHash = user ? null : (hash ??= await hashPassword(DEV_PASSWORD))
    await sql.begin(async (tx) => {
      if (passwordHash) {
        await tx`insert into users (id, name, email, email_verified) values (${account.id}, ${account.name}, ${account.email}, true)`
        await tx`insert into accounts (user_id, provider_id, account_id, password) values (${account.id}, 'credential', ${account.id}, ${passwordHash})`
      }
      await tx`
        insert into profiles (id, username, full_name, onboarded, role, locale)
        values (${account.id}, ${account.username}, ${account.name}, true, ${account.role}, ${account.locale ?? null})`
    })
    results.push({ account, outcome: user ? "profile added" : "added" })
  }
  return results
}
