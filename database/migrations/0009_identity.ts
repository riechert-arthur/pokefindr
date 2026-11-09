/**
 * Accounts in our own database (PA-3, #38), for Better Auth:
 *
 * - `users`: who someone is. A profile shares its user's id.
 * - `accounts`: how they sign in: a password ("credential") or an OAuth identity.
 * - `sessions`: Better Auth's sessions. The app keeps its own `app_session`
 *   cookie for requests; these back sign-in, OAuth and revocation.
 * - `verifications`: one-time tokens (email confirmation, password reset).
 * - `auth_rate_limits`: Better Auth's rate-limit counters.
 *
 * `profiles.id` now references `users.id` (it referenced Supabase's
 * `auth.users` there). It's added NOT VALID: profiles that predate this
 * migration have no user here, and stay as they are (accounts start fresh,
 * plans/db_provider_decision.md). Every new profile is checked.
 */
import { sql, type Kysely } from "kysely"

const timestamps = <T extends Parameters<Kysely<unknown>["schema"]["createTable"]>[0]>(db: Kysely<unknown>, name: T) =>
  db.schema
    .createTable(name)
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))

export async function up(db: Kysely<unknown>): Promise<void> {
  await timestamps(db, "users")
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("email", "text", (c) => c.notNull())
    .addColumn("email_verified", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("image", "text")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("users_email_unique", ["email"])
    .execute()

  await timestamps(db, "sessions")
    .addColumn("user_id", "uuid", (c) => c.notNull())
    .addColumn("token", "text", (c) => c.notNull())
    .addColumn("expires_at", "timestamptz", (c) => c.notNull())
    .addColumn("ip_address", "text")
    .addColumn("user_agent", "text")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("sessions_token_unique", ["token"])
    .addForeignKeyConstraint("sessions_user_id_users_id_fk", ["user_id"], "users", ["id"], (c) => c.onDelete("cascade"))
    .execute()
  await db.schema.createIndex("sessions_user_id_idx").on("sessions").column("user_id").execute()

  await timestamps(db, "accounts")
    .addColumn("user_id", "uuid", (c) => c.notNull())
    .addColumn("provider_id", "text", (c) => c.notNull())
    .addColumn("account_id", "text", (c) => c.notNull())
    .addColumn("password", "text")
    .addColumn("access_token", "text")
    .addColumn("refresh_token", "text")
    .addColumn("id_token", "text")
    .addColumn("access_token_expires_at", "timestamptz")
    .addColumn("refresh_token_expires_at", "timestamptz")
    .addColumn("scope", "text")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint("accounts_user_id_users_id_fk", ["user_id"], "users", ["id"], (c) => c.onDelete("cascade"))
    .execute()
  await db.schema.createIndex("accounts_user_id_idx").on("accounts").column("user_id").execute()
  await db.schema.createIndex("accounts_provider_account_key").unique().on("accounts").columns(["provider_id", "account_id"]).execute()

  await timestamps(db, "verifications")
    .addColumn("identifier", "text", (c) => c.notNull())
    .addColumn("value", "text", (c) => c.notNull())
    .addColumn("expires_at", "timestamptz", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute()
  await db.schema.createIndex("verifications_identifier_idx").on("verifications").column("identifier").execute()

  await timestamps(db, "auth_rate_limits")
    .addColumn("key", "text", (c) => c.notNull())
    .addColumn("count", "integer", (c) => c.notNull())
    .addColumn("last_request", "bigint", (c) => c.notNull())
    .addUniqueConstraint("auth_rate_limits_key_unique", ["key"])
    .execute()

  // Named as Drizzle names it, so db:check matches.
  await sql`alter table profiles add constraint profiles_id_users_id_fk foreign key (id) references users (id) on delete cascade not valid`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table profiles drop constraint profiles_id_users_id_fk`.execute(db)
  for (const t of ["auth_rate_limits", "verifications", "accounts", "sessions", "users"]) await db.schema.dropTable(t).execute()
}
