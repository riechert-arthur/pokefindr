import "server-only"
import type { Role } from "@/lib/auth/roles"
import { and, eq, gt, ne, sql, type SQLWrapper } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { profiles, subscriptions, usernameHolds, users } from "@/server/db/schema"
import type { SessionTier } from "@/server/auth/session"

/** What the client's session context gets (the shape /api/auth/user has always returned). */
export interface PublicProfile {
  id: string
  username: string
  full_name: string | null
  metadata: unknown
  /** member, moderator or admin: what the app shows (an Admin link); the API checks it again. */
  role: Role
  /** The language they picked (#182), or null. */
  locale: string | null
}

export class UsernameTakenError extends Error {
  constructor() {
    super("That username is already taken")
  }
}

const UNIQUE_VIOLATION = "23505"

function isUniqueViolation(err: unknown): boolean {
  // Drizzle wraps driver errors; the Postgres error sits on `cause`.
  return [err, (err as { cause?: unknown })?.cause].some((e) => typeof e === "object" && e !== null && (e as { code?: string }).code === UNIQUE_VIOLATION)
}

export async function getProfile(userId: string, db: Database = getDb()): Promise<PublicProfile | null> {
  const [row] = await db
    .select({ id: profiles.id, username: profiles.username, full_name: profiles.fullName, metadata: profiles.metadata, role: profiles.role, locale: profiles.locale })
    .from(profiles)
    .where(eq(profiles.id, userId))
  return row ?? null
}

/** Whether a user exists (sign-up answers the same for a new and a taken email, so the route checks). */
export async function userExists(userId: string, db: Database = getDb()): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))
  return Boolean(row)
}

/** Deletes a user and, by cascade, their accounts, sessions and profile. */
export async function deleteUser(userId: string, db: Database = getDb()): Promise<void> {
  await db.delete(users).where(eq(users.id, userId))
}

/**
 * A profile whose account never confirmed its email, and whose sign-up's hold
 * on the name has lapsed (a day: the confirmation link has expired too). Its
 * name is free again, on the hold's clock, the same moment a hold left by a
 * sign-up with a taken email lapses. Profiles from before our own accounts
 * have no user row, and keep their names.
 */
const expiredClaim = (username: SQLWrapper) => sql`(
  ${users.emailVerified} = false
  and not exists (select 1 from ${usernameHolds} where ${usernameHolds.username} = lower(${username}) and ${usernameHolds.expiresAt} > now())
)`

/** Whether another profile, or a sign-up's hold, has this username, in any case ("Ash" and "ash" are the same). */
export async function usernameTaken(username: string, exceptUserId?: string, db: Database = getDb()): Promise<boolean> {
  const same = sql`lower(${profiles.username}) = lower(${username})`
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .leftJoin(users, eq(users.id, profiles.id))
    .where(and(exceptUserId ? and(same, ne(profiles.id, exceptUserId)) : same, sql`not coalesce(${expiredClaim(profiles.username)}, false)`))
    .limit(1)
  if (row) return true
  // A sign-up's hold counts too (from settings as well, or renaming would show the same thing),
  // except for the account that already has the name.
  if (exceptUserId) {
    const [own] = await db.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.id, exceptUserId), same)).limit(1)
    if (own) return false
  }
  const [held] = await db
    .select({ username: usernameHolds.username })
    .from(usernameHolds)
    .where(and(eq(usernameHolds.username, sql`lower(${username})`), gt(usernameHolds.expiresAt, sql`now()`)))
    .limit(1)
  return Boolean(held)
}

/**
 * Removes an unconfirmed account whose claim on this username has lapsed
 * (expiredClaim), so the name can be used. Sign-up calls it before Better
 * Auth runs, for a new email and a taken one alike.
 */
export async function clearExpiredClaim(username: string, db: Database = getDb()): Promise<void> {
  await db.delete(users).where(
    and(
      sql`${users.id} in (select ${profiles.id} from ${profiles} where lower(${profiles.username}) = lower(${username}))`,
      sql`${expiredClaim(sql`${username}`)}`,
    ),
  )
}

/**
 * Claims a username for a day, for a sign-up (see usernameHolds), in one
 * statement, so two sign-ups at once can't both get it. Called before the
 * email is known to be new or taken. False if it's already held.
 */
export async function holdUsername(username: string, db: Database = getDb()): Promise<boolean> {
  const expiresAt = sql`now() + interval '1 day'`
  const claimed = await db
    .insert(usernameHolds)
    .values({ username: sql`lower(${username})`, expiresAt })
    .onConflictDoUpdate({ target: usernameHolds.username, set: { expiresAt }, setWhere: sql`${usernameHolds.expiresAt} <= now()` })
    .returning({ username: usernameHolds.username })
  return claimed.length > 0
}

/** Lets go of a hold, when the sign-up that claimed it didn't go through (bad input, rate limit). */
export async function releaseUsername(username: string, db: Database = getDb()): Promise<void> {
  await db.delete(usernameHolds).where(eq(usernameHolds.username, sql`lower(${username})`))
}

/** Creates a user's profile. Throws UsernameTakenError on a duplicate username. */
export async function createProfile(
  profile: { id: string; username: string; fullName?: string | null; onboarded: boolean },
  db: Database = getDb(),
): Promise<void> {
  await clearExpiredClaim(profile.username, db)
  try {
    await db.insert(profiles).values(profile)
  } catch (err) {
    if (isUniqueViolation(err)) throw new UsernameTakenError()
    throw err
  }
}

/** Updates profile fields. Returns false if the profile doesn't exist. Throws UsernameTakenError on a duplicate username. */
export async function updateProfile(
  userId: string,
  changes: { username?: string; fullName?: string; onboarded?: boolean; locale?: string },
  db: Database = getDb(),
): Promise<boolean> {
  const set = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined))
  if (Object.keys(set).length === 0) return true
  if (changes.username) await clearExpiredClaim(changes.username, db)
  try {
    const updated = await db.update(profiles).set(set).where(eq(profiles.id, userId)).returning({ id: profiles.id })
    return updated.length > 0
  } catch (err) {
    if (isUniqueViolation(err)) throw new UsernameTakenError()
    throw err
  }
}

/** Session tier: any subscription row counts as paid, expired or not (as before; #35 decides whether it should). */
export async function getSessionTier(userId: string, db: Database = getDb()): Promise<SessionTier> {
  const [row] = await db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1)
  return row ? "paid" : "free"
}
