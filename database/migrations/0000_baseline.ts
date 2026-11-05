/**
 * Baseline: mirrors the existing Supabase `public` schema.
 *
 * On a FRESH database, `npm run db:migrate` runs this.
 * On the EXISTING production database, don't run it: `npm run db:baseline`
 * records it as already applied (see docs/database.md).
 *
 * No `down` on purpose: undoing it would drop every table. To start a local
 * database over, recreate it instead.
 *
 * Names of indexes and constraints match src/server/db/schema, so the drift
 * check (`npm run db:check`) finds nothing to change.
 */
import { sql, type CreateTableBuilder, type Kysely } from "kysely"

const LOCATION_STATUSES = ["stocked", "out-of-stock", "out-of-order"]

// The few things Kysely's schema builder can't express come in as `sql` fragments.
const uuidPk = sql`gen_random_uuid()`
const now = sql`now()`
const geographyPoint = sql`geography(point, 4326)`

/** Columns shared by `locations` and `locations_staging`. */
function locationColumns<T extends string>(table: CreateTableBuilder<T>) {
  return table
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(uuidPk))
    .addColumn("machineID", "text")
    .addColumn("name", "text")
    .addColumn("description", "text")
    .addColumn("geog", geographyPoint)
    .addColumn("is_official", "boolean")
    .addColumn("created_by", "uuid")
    .addColumn("created_at", "timestamptz", (c) => c.defaultTo(now))
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists postgis`.execute(db)

  await db.schema.createType("location_status").asEnum(LOCATION_STATUSES).execute()

  await db.schema
    .createTable("profiles")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("username", "text", (c) => c.notNull())
    .addColumn("full_name", "text")
    .addColumn("is_verified", "boolean")
    .addColumn("onboarded", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("rating", "double precision")
    .addColumn("metadata", "jsonb")
    .addColumn("created_at", "timestamptz", (c) => c.defaultTo(now))
    .addColumn("updated_at", "timestamptz", (c) => c.defaultTo(now))
    .execute()

  await locationColumns(db.schema.createTable("locations"))
    .addForeignKeyConstraint("locations_created_by_profiles_id_fk", ["created_by"], "profiles", ["id"])
    .execute()
  await db.schema.createIndex("locations_machine_id_key").on("locations").unique().column("machineID").execute()
  await db.schema.createIndex("locations_geog_gist").on("locations").using("gist").column("geog").execute()

  // Production created this with `LIKE public.locations INCLUDING ALL`, which
  // copies indexes but not foreign keys.
  await locationColumns(db.schema.createTable("locations_staging")).execute()
  await db.schema
    .createIndex("locations_staging_machineID_idx")
    .on("locations_staging")
    .unique()
    .column("machineID")
    .execute()
  await db.schema.createIndex("locations_staging_geog_idx").on("locations_staging").using("gist").column("geog").execute()

  await db.schema
    .createTable("location_ratings")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(uuidPk))
    .addColumn("location_id", "uuid", (c) => c.notNull())
    .addColumn("user_id", "uuid", (c) => c.notNull())
    .addColumn("rating", "integer", (c) => c.notNull())
    .addColumn("text", "text")
    .addColumn("created_at", "timestamptz", (c) => c.defaultTo(now))
    .addCheckConstraint("location_ratings_rating_range", sql`rating between 1 and 5`)
    .addForeignKeyConstraint("location_ratings_location_id_locations_id_fk", ["location_id"], "locations", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addForeignKeyConstraint("location_ratings_user_id_profiles_id_fk", ["user_id"], "profiles", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .execute()
  await db.schema.createIndex("location_ratings_location_id_idx").on("location_ratings").column("location_id").execute()
  await db.schema.createIndex("location_ratings_user_id_idx").on("location_ratings").column("user_id").execute()

  await db.schema
    .createTable("status_reports")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(uuidPk))
    .addColumn("location_id", "uuid", (c) => c.notNull())
    .addColumn("user_id", "uuid", (c) => c.notNull())
    .addColumn("status", sql`location_status`, (c) => c.notNull())
    .addColumn("comment", "text")
    .addColumn("created_at", "timestamptz", (c) => c.defaultTo(now))
    .addForeignKeyConstraint("status_reports_location_id_locations_id_fk", ["location_id"], "locations", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addForeignKeyConstraint("status_reports_user_id_profiles_id_fk", ["user_id"], "profiles", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .execute()
  await db.schema
    .createIndex("status_reports_location_created_idx")
    .on("status_reports")
    .columns(["location_id", "created_at"])
    .execute()

  await db.schema
    .createTable("subscriptions")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(uuidPk))
    .addColumn("user_id", "uuid", (c) => c.notNull())
    .addColumn("plan_name", "text", (c) => c.notNull())
    .addColumn("price", "numeric", (c) => c.notNull())
    .addColumn("start_date", "timestamptz", (c) => c.notNull().defaultTo(now))
    .addColumn("end_date", "timestamptz", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.defaultTo(now))
    .addForeignKeyConstraint("subscriptions_user_id_profiles_id_fk", ["user_id"], "profiles", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .execute()
  await db.schema.createIndex("subscriptions_user_id_idx").on("subscriptions").column("user_id").execute()

  await db.schema
    .createTable("trust_ratings")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(uuidPk))
    .addColumn("rated_user_id", "uuid", (c) => c.notNull())
    .addColumn("rater_user_id", "uuid", (c) => c.notNull())
    .addColumn("rating", "integer", (c) => c.notNull())
    .addColumn("comment", "text")
    .addColumn("created_at", "timestamptz", (c) => c.defaultTo(now))
    .addForeignKeyConstraint("trust_ratings_rated_user_id_profiles_id_fk", ["rated_user_id"], "profiles", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addForeignKeyConstraint("trust_ratings_rater_user_id_profiles_id_fk", ["rater_user_id"], "profiles", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .execute()
}
