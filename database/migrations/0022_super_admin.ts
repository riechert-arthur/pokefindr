/**
 * A super admin (#294): everything an admin can do, plus User management,
 * where they set other people's roles. Granting `super_admin` itself is SQL-
 * or seed-only. What each role may do lives in src/lib/auth/entitlements.ts.
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table profiles
      drop constraint profiles_role_check,
      add constraint profiles_role_check check (role in ('member', 'moderator', 'admin', 'super_admin'))
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Super admins become admins again, the nearest role the old check allows.
  await sql`update profiles set role = 'admin' where role = 'super_admin'`.execute(db)
  await sql`
    alter table profiles
      drop constraint profiles_role_check,
      add constraint profiles_role_check check (role in ('member', 'moderator', 'admin'))
  `.execute(db)
}
