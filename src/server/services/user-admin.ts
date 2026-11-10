import "server-only"
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { profiles, roleChanges, users } from "@/server/db/schema"
import { can, rolesWith } from "@/lib/auth/entitlements"
import { GRANTABLE_ROLES, type GrantableRole, type Role } from "@/lib/auth/roles"
import { USERS_PER_PAGE, type SetRoleResult, type UserPage } from "@/lib/admin/users"

/** `%` and `_` typed into the search match themselves, not any text. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** The cursor is the last row's join time and id, so a page never repeats or skips someone who signed up meanwhile. */
const encodeCursor = (at: Date, id: string) => Buffer.from(JSON.stringify([at.toISOString(), id])).toString("base64url")
function decodeCursor(cursor: string): [Date, string] | null {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown[]
    if (typeof at !== "string" || typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(Date.parse(at))) return null
    return [new Date(at), id]
  } catch {
    return null
  }
}

/**
 * Admin → Users (#294): everyone with a profile, newest first, USERS_PER_PAGE
 * at a time. `q` matches part of a username or name, or the start of an
 * email; `role` keeps one role. An unreadable cursor starts from the top.
 */
export async function listUsers(
  { q, role, cursor }: { q?: string | null; role?: Role | null; cursor?: string | null },
  db: Database = getDb(),
): Promise<UserPage> {
  const where: (SQL | undefined)[] = []
  const term = q?.trim()
  if (term) {
    const t = escapeLike(term)
    where.push(or(ilike(profiles.username, `%${t}%`), ilike(profiles.fullName, `%${t}%`), ilike(users.name, `%${t}%`), ilike(users.email, `${t}%`)))
  }
  if (role) where.push(eq(profiles.role, role))
  const after = cursor ? decodeCursor(cursor) : null
  if (after) where.push(sql`(${users.createdAt}, ${users.id}) < (${after[0].toISOString()}::timestamptz, ${after[1]}::uuid)`)
  const rows = await db
    .select({ id: users.id, username: profiles.username, fullName: profiles.fullName, accountName: users.name, email: users.email, role: profiles.role, joinedAt: users.createdAt })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.id))
    .where(and(...where))
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(USERS_PER_PAGE + 1)
  const page = rows.slice(0, USERS_PER_PAGE)
  const last = page.at(-1)
  return {
    users: page.map((r) => ({ id: r.id, username: r.username, name: r.fullName || r.accountName, email: r.email, role: r.role, joinedAt: r.joinedAt.toISOString() })),
    nextCursor: rows.length > USERS_PER_PAGE && last ? encodeCursor(last.joinedAt, last.id) : null,
  }
}

const isGrantable = (role: string): role is GrantableRole => (GRANTABLE_ROLES as readonly string[]).includes(role)

/**
 * Sets `targetId`'s role to `role` for `actorId`, and records the change in
 * role_changes. Refuses a role outside GRANTABLE_ROLES (super_admin is SQL-
 * and seed-only), your own role, an actor who can't manage users, and taking
 * the last user manager's role away. The actor's and target's rows are
 * locked, so two changes at once can't both pass the last-super-admin check.
 */
export async function setRole(actorId: string, targetId: string, role: string, db: Database = getDb(), now = new Date()): Promise<SetRoleResult> {
  if (!isGrantable(role)) return { status: "invalid_role" }
  if (actorId === targetId) return { status: "own" }
  return db.transaction(async (tx): Promise<SetRoleResult> => {
    // Lock everyone who can manage users first, in one order, then the target.
    const managers = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(inArray(profiles.role, rolesWith("users.manage")))
      .orderBy(profiles.id)
      .for("update")
    const [actor] = await tx.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, actorId)).for("update")
    if (!actor || !can(actor.role, "users.manage")) return { status: "forbidden" }
    const [target] = await tx.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, targetId)).for("update")
    if (!target) return { status: "not_found" }
    if (target.role === role) return { status: "unchanged" }
    if (can(target.role, "users.manage") && !can(role, "users.manage") && managers.length <= 1) return { status: "last_super_admin" }
    await tx.update(profiles).set({ role }).where(eq(profiles.id, targetId))
    await tx.insert(roleChanges).values({ userId: targetId, changedBy: actorId, fromRole: target.role, toRole: role, createdAt: now })
    return { status: "done", from: target.role, to: role }
  })
}
