/**
 * PokeFindr as an OAuth authorization server for MCP clients (#134), the
 * tables of Better Auth's `jwt` and `mcp` (OAuth Provider) plugins:
 *
 * - `jwks`: the keys access tokens are signed with. The private key is
 *   encrypted with BETTER_AUTH_SECRET.
 * - `oauth_clients`: MCP clients (Claude, Cursor, ...), registered through a
 *   Client ID Metadata Document or dynamic registration.
 * - `oauth_resources`, `oauth_client_resources`: the resource tokens are for
 *   (/api/mcp/account) and which clients may ask for it.
 * - `oauth_consents`: what each person allowed each client.
 * - `oauth_access_tokens`, `oauth_refresh_tokens`: tokens issued (stored
 *   hashed). Access tokens for the MCP resource are JWTs, checked without a
 *   lookup; the rows let a person's tokens be revoked.
 * - `oauth_client_assertions`: used client assertion ids, so one can't be replayed.
 *
 * Column names are Better Auth's fields in snake_case. Deleting a user
 * deletes their tokens and consents.
 */
import { sql, type Kysely } from "kysely"

type Db = Kysely<unknown>
const uuidPk = (db: Db, name: string) => db.schema.createTable(name).addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
const now = sql`now()`

/** Unique columns, named as Drizzle names them (<table>_<column>_unique). */
const UNIQUE: [table: string, column: string][] = [
  ["oauth_clients", "client_id"],
  ["oauth_resources", "identifier"],
  ["oauth_refresh_tokens", "token"],
  ["oauth_access_tokens", "token"],
]

/**
 * Foreign keys, named as Drizzle names them (<table>_<column>_<ref table>_<ref column>_fk),
 * or given a shorter name where that passes Postgres's 63 characters.
 */
const FOREIGN_KEYS: [table: string, column: string, ref: string, onDelete: "cascade" | "set null", name?: string][] = [
  ["oauth_clients", "user_id", "users.id", "set null"],
  ["oauth_client_resources", "client_id", "oauth_clients.client_id", "cascade"],
  ["oauth_client_resources", "resource_id", "oauth_resources.identifier", "cascade", "oauth_client_resources_resource_id_fk"],
  ["oauth_refresh_tokens", "client_id", "oauth_clients.client_id", "cascade"],
  ["oauth_refresh_tokens", "session_id", "sessions.id", "set null"],
  ["oauth_refresh_tokens", "user_id", "users.id", "cascade"],
  ["oauth_access_tokens", "client_id", "oauth_clients.client_id", "cascade"],
  ["oauth_access_tokens", "session_id", "sessions.id", "set null"],
  ["oauth_access_tokens", "user_id", "users.id", "cascade"],
  ["oauth_access_tokens", "refresh_id", "oauth_refresh_tokens.id", "cascade"],
  ["oauth_consents", "client_id", "oauth_clients.client_id", "cascade"],
  ["oauth_consents", "user_id", "users.id", "cascade"],
]

export async function up(db: Db): Promise<void> {
  await uuidPk(db, "jwks")
    .addColumn("public_key", "text", (c) => c.notNull())
    .addColumn("private_key", "text", (c) => c.notNull())
    .addColumn("alg", "text")
    .addColumn("crv", "text")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(now))
    .addColumn("expires_at", "timestamptz")
    .execute()

  await uuidPk(db, "oauth_clients")
    .addColumn("client_id", "text", (c) => c.notNull())
    .addColumn("client_secret", "text")
    .addColumn("client_discovery_id", "text")
    .addColumn("disabled", "boolean", (c) => c.defaultTo(false))
    .addColumn("skip_consent", "boolean")
    .addColumn("enable_end_session", "boolean")
    .addColumn("subject_type", "text")
    .addColumn("scopes", sql`text[]`)
    .addColumn("client_credentials_scopes", sql`text[]`)
    .addColumn("user_id", "uuid")
    .addColumn("name", "text")
    .addColumn("uri", "text")
    .addColumn("icon", "text")
    .addColumn("contacts", sql`text[]`)
    .addColumn("tos", "text")
    .addColumn("policy", "text")
    .addColumn("software_id", "text")
    .addColumn("software_version", "text")
    .addColumn("software_statement", "text")
    .addColumn("redirect_uris", sql`text[]`, (c) => c.notNull())
    .addColumn("post_logout_redirect_uris", sql`text[]`)
    .addColumn("backchannel_logout_uri", "text")
    .addColumn("backchannel_logout_session_required", "boolean")
    .addColumn("token_endpoint_auth_method", "text")
    .addColumn("application_type", "text")
    .addColumn("jwks", "text")
    .addColumn("jwks_uri", "text")
    .addColumn("grant_types", sql`text[]`)
    .addColumn("response_types", sql`text[]`)
    .addColumn("require_pkce", "boolean")
    .addColumn("dpop_bound_access_tokens", "boolean", (c) => c.defaultTo(false))
    .addColumn("reference_id", "text")
    .addColumn("metadata", "jsonb")
    .addColumn("created_at", "timestamptz", (c) => c.defaultTo(now))
    .addColumn("updated_at", "timestamptz", (c) => c.defaultTo(now))
    .execute()
  await db.schema.createIndex("oauth_clients_user_id_idx").on("oauth_clients").column("user_id").execute()

  await uuidPk(db, "oauth_resources")
    .addColumn("identifier", "text", (c) => c.notNull())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("access_token_ttl", "integer")
    .addColumn("refresh_token_ttl", "integer")
    .addColumn("signing_algorithm", "text")
    .addColumn("signing_key_id", "text")
    .addColumn("allowed_scopes", sql`text[]`)
    .addColumn("custom_claims", "jsonb")
    .addColumn("dpop_bound_access_tokens_required", "boolean", (c) => c.defaultTo(false))
    .addColumn("disabled", "boolean", (c) => c.defaultTo(false))
    .addColumn("policy_version", "integer", (c) => c.defaultTo(1))
    .addColumn("metadata", "jsonb")
    .addColumn("created_at", "timestamptz", (c) => c.defaultTo(now))
    .addColumn("updated_at", "timestamptz", (c) => c.defaultTo(now))
    .execute()

  await uuidPk(db, "oauth_client_resources")
    .addColumn("client_id", "text", (c) => c.notNull())
    .addColumn("resource_id", "text", (c) => c.notNull())
    .addColumn("metadata", "jsonb")
    .addColumn("created_at", "timestamptz", (c) => c.defaultTo(now))
    .execute()
  await db.schema.createIndex("oauth_client_resources_client_id_idx").on("oauth_client_resources").column("client_id").execute()
  await db.schema.createIndex("oauth_client_resources_resource_id_idx").on("oauth_client_resources").column("resource_id").execute()

  // Columns both token tables have.
  const tokenColumns = <T extends ReturnType<typeof uuidPk>>(t: T) =>
    t
      .addColumn("client_id", "text", (c) => c.notNull())
      .addColumn("session_id", "uuid")
      .addColumn("reference_id", "text")
      .addColumn("authorization_code_id", "text")
      .addColumn("resources", sql`text[]`)
      .addColumn("requested_user_info_claims", sql`text[]`)
      .addColumn("scopes", sql`text[]`, (c) => c.notNull())
      .addColumn("confirmation", "jsonb")
      .addColumn("expires_at", "timestamptz")
      .addColumn("revoked", "timestamptz")
      .addColumn("created_at", "timestamptz", (c) => c.defaultTo(now))

  await tokenColumns(uuidPk(db, "oauth_refresh_tokens"))
    .addColumn("token", "text", (c) => c.notNull())
    .addColumn("user_id", "uuid", (c) => c.notNull())
    .addColumn("rotated_at", "timestamptz")
    .addColumn("rotation_replay_response", "text")
    .addColumn("rotation_replay_expires_at", "timestamptz")
    .addColumn("auth_time", "timestamptz")
    .execute()

  await tokenColumns(uuidPk(db, "oauth_access_tokens"))
    .addColumn("token", "text")
    .addColumn("user_id", "uuid")
    .addColumn("refresh_id", "uuid")
    .execute()

  for (const table of ["oauth_refresh_tokens", "oauth_access_tokens"]) {
    for (const column of ["client_id", "session_id", "user_id", "authorization_code_id"]) {
      await db.schema.createIndex(`${table}_${column}_idx`).on(table).column(column).execute()
    }
  }
  await db.schema.createIndex("oauth_access_tokens_refresh_id_idx").on("oauth_access_tokens").column("refresh_id").execute()

  await uuidPk(db, "oauth_consents")
    .addColumn("client_id", "text", (c) => c.notNull())
    .addColumn("user_id", "uuid")
    .addColumn("reference_id", "text")
    .addColumn("resources", sql`text[]`)
    .addColumn("requested_user_info_claims", sql`text[]`)
    .addColumn("scopes", sql`text[]`, (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.defaultTo(now))
    .addColumn("updated_at", "timestamptz", (c) => c.defaultTo(now))
    .execute()
  await db.schema.createIndex("oauth_consents_client_id_idx").on("oauth_consents").column("client_id").execute()
  await db.schema.createIndex("oauth_consents_user_id_idx").on("oauth_consents").column("user_id").execute()

  await uuidPk(db, "oauth_client_assertions").addColumn("expires_at", "timestamptz", (c) => c.notNull()).execute()
  await db.schema.createIndex("oauth_client_assertions_expires_at_idx").on("oauth_client_assertions").column("expires_at").execute()

  // After every table exists, so each reference has its target.
  for (const [table, column] of UNIQUE) {
    await db.schema.alterTable(table).addUniqueConstraint(`${table}_${column}_unique`, [column]).execute()
  }
  for (const [table, column, ref, onDelete, name] of FOREIGN_KEYS) {
    const [refTable, refColumn] = ref.split(".")
    await db.schema
      .alterTable(table)
      .addForeignKeyConstraint(name ?? `${table}_${column}_${refTable}_${refColumn}_fk`, [column], refTable, [refColumn], (c) => c.onDelete(onDelete))
      .execute()
  }
}

export async function down(db: Db): Promise<void> {
  for (const table of ["oauth_client_assertions", "oauth_consents", "oauth_access_tokens", "oauth_refresh_tokens", "oauth_client_resources", "oauth_resources", "oauth_clients", "jwks"]) {
    await db.schema.dropTable(table).execute()
  }
}
