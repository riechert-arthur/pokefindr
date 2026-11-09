import "server-only"
import { and, eq, ne, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { profiles, subscriptions, users } from "@/server/db/schema"
import type { SessionTier } from "@/server/auth/session"

/** What the client's session context gets (the shape /api/auth/user has always returned). */
export interface PublicProfile {
  id: string
  username: string
  full_name: string | null
  metadata: unknown
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
    .select({ id: profiles.id, username: profiles.username, full_name: profiles.fullName, metadata: profiles.metadata })
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

/** Whether another profile has this username, in any case ("Ash" and "ash" are the same). */
export async function usernameTaken(username: string, exceptUserId?: string, db: Database = getDb()): Promise<boolean> {
  const same = sql`lower(${profiles.username}) = lower(${username})`
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(exceptUserId ? and(same, ne(profiles.id, exceptUserId)) : same)
    .limit(1)
  return Boolean(row)
}

/** Creates a user's profile. Throws UsernameTakenError on a duplicate username. */
export async function createProfile(
  profile: { id: string; username: string; fullName?: string | null; onboarded: boolean },
  db: Database = getDb(),
): Promise<void> {
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
  changes: { username?: string; fullName?: string; onboarded?: boolean },
  db: Database = getDb(),
): Promise<boolean> {
  const set = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined))
  if (Object.keys(set).length === 0) return true
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
