import "server-only"
import { eq, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { profiles, subscriptions } from "@/server/db/schema"
import type { SessionTier } from "@/server/auth/session"

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
  const candidates = [err, (err as { cause?: unknown })?.cause]
  return candidates.some(
    (e) => typeof e === "object" && e !== null && (e as { code?: string }).code === UNIQUE_VIOLATION,
  )
}

/** The profile shape the client's session context expects. */
export async function getProfile(userId: string, db: Database = getDb()): Promise<PublicProfile | null> {
  const [row] = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      full_name: profiles.fullName,
      metadata: profiles.metadata,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
  return row ?? null
}

/** Whether the user finished choosing a username (OAuth sign-ups start without one). */
export async function getOnboardingState(
  userId: string,
  db: Database = getDb(),
): Promise<{ onboarded: boolean } | null> {
  const [row] = await db
    .select({ onboarded: profiles.onboarded })
    .from(profiles)
    .where(eq(profiles.id, userId))
  return row ?? null
}

/**
 * Updates profile fields. Returns false if the profile doesn't exist.
 * Throws UsernameTakenError on a duplicate username.
 */
export async function updateProfile(
  userId: string,
  changes: { username?: string; fullName?: string; onboarded?: boolean },
  db: Database = getDb(),
): Promise<boolean> {
  const set = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined))
  if (Object.keys(set).length === 0) return true

  try {
    const updated = await db
      .update(profiles)
      .set({ ...set, updatedAt: sql`now()` })
      .where(eq(profiles.id, userId))
      .returning({ id: profiles.id })
    return updated.length > 0
  } catch (err) {
    if (isUniqueViolation(err)) throw new UsernameTakenError()
    throw err
  }
}

/**
 * Session tier. Matches the previous behaviour: any subscription row
 * counts as paid, expired or not.
 */
export async function getSessionTier(userId: string, db: Database = getDb()): Promise<SessionTier> {
  const [row] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1)
  return row ? "paid" : "free"
}
