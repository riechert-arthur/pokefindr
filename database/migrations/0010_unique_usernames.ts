/**
 * Usernames are unique, in any case ("Ash" and "ash" are one name). Supabase
 * had this rule; the baseline didn't carry it over. Sign-up and settings
 * check first and answer 409; this index makes the rule hold under races.
 *
 * Fails with the duplicates listed, rather than picking a winner, if the
 * database already has any.
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  const { rows } = await sql<{ name: string; n: number }>`
    select lower(username) as name, count(*)::int as n from profiles group by 1 having count(*) > 1 order by 1 limit 20`.execute(db)
  if (rows.length) throw new Error(`Usernames used more than once (rename all but one, then rerun): ${rows.map((r) => `${r.name} (${r.n})`).join(", ")}`)
  await sql`create unique index profiles_username_lower_key on profiles (lower(username))`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("profiles_username_lower_key").execute()
}
