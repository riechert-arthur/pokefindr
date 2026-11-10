/**
 * The language a signed-in person picked (#182): `profiles.locale`, a code
 * from src/i18n/routing.ts ("en", "es"). Null until they pick one. Signing in
 * sets the language cookie from it, so the choice follows them to other
 * devices.
 */
import type { Kysely } from "kysely"

type Db = Kysely<unknown>

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("profiles").addColumn("locale", "text").execute()
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("profiles").dropColumn("locale").execute()
}
