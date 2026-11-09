/**
 * Who may moderate (#126): `profiles.role` is member (everyone), moderator
 * (reviews submissions) or admin (moderator, and later the rest of /admin).
 * The fuller entitlement system (#70) can replace this; until then a role is
 * set by hand: `update profiles set role = 'moderator' where username = '…'`.
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table profiles
      add column role text not null default 'member',
      add constraint profiles_role_check check (role in ('member', 'moderator', 'admin'))
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table profiles drop constraint profiles_role_check, drop column role`.execute(db)
}
