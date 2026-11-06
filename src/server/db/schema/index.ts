/**
 * Database schema: the source of truth for table types.
 *
 * Migrations are written separately with Kysely (database/migrations). The
 * integration tests (and `npm run db:check`) fail if the database they build
 * doesn't match this file.
 *
 * Mirrors the existing Supabase `public` schema, rebuilt from the generated
 * Supabase types. Column names match the live database exactly (including
 * the quoted "machineID", which the generated types predate: the weekly
 * update upserts on it); TypeScript property names are camelCase.
 *
 * `database/migrations/0000_baseline.ts` must describe production exactly,
 * because it is recorded there without running. `npm run db:baseline` compares
 * the database with it first and refuses on any difference.
 *
 * Not modelled here:
 * - Supabase's `auth` schema. In Supabase, `profiles.id` references
 *   `auth.users.id`; that foreign key belongs to the auth migration.
 * - The views `active_subscriptions`, `latest_status_reports`,
 *   `location_rating_summary` and `user_trust_summary`, which are being
 *   replaced by typed queries in services.
 * - The legacy "Vending Machine Locations" table.
 */
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { geographyPoint } from "../geography"

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow()

export const locationStatus = pgEnum("location_status", [
  "stocked",
  "out-of-stock",
  "out-of-order",
])

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  username: text("username").notNull(),
  fullName: text("full_name"),
  isVerified: boolean("is_verified"),
  onboarded: boolean("onboarded").notNull().default(false),
  rating: doublePrecision("rating"),
  metadata: jsonb("metadata"),
  createdAt: createdAt(),
  // Set by the ORM on every update; there is no database trigger for it.
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/** Mapbox's per-field match result for a geocoded address, plus its overall `confidence`. */
export type MatchCode = Record<string, string>

const locationColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  machineId: text("machineID"),
  name: text("name"),
  description: text("description"),
  retailer: text("retailer"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  geog: geographyPoint("geog"),
  isOfficial: boolean("is_official"),
  /** Inactive locations are hidden from the map but keep their reviews. */
  isActive: boolean("is_active").notNull().default(true),
  /** Where the row came from, e.g. "pokemoncenter" for the scraped list. */
  source: text("source"),
  mapboxId: text("mapbox_id"),
  /** Mapbox's `coordinates.accuracy`: rooftop, parcel, point, interpolated or approximate. */
  geocodeAccuracy: text("geocode_accuracy"),
  matchCode: jsonb("match_code").$type<MatchCode>(),
  /** Set when someone checked or corrected this machine by hand (`_manual_override` in the JSON). */
  manualOverride: boolean("manual_override").notNull().default(false),
  /**
   * "file" when the JSON's `_manual_override` set the override, so the import
   * clears it once the JSON drops the flag. Null for an override made in the
   * database, which the import keeps.
   */
  manualOverrideSource: text("manual_override_source"),
  /** The full feature properties from the JSON, kept while the data moves off it. */
  raw: jsonb("raw"),
  // Set by the ORM on every update (and by the location import); there is no trigger.
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const locations = pgTable(
  "locations",
  {
    ...locationColumns,
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("locations_machine_id_key").on(t.machineId),
    index("locations_geog_gist").using("gist", t.geog),
  ],
)

/**
 * ETL landing table; same columns as `locations`. Production created it with
 * `LIKE public.locations INCLUDING ALL`, which copies indexes (under
 * Postgres-generated names, matched here) but not foreign keys, so
 * `created_by` has no reference.
 */
export const locationsStaging = pgTable(
  "locations_staging",
  { ...locationColumns, createdBy: uuid("created_by"), createdAt: createdAt() },
  (t) => [
    uniqueIndex("locations_staging_machineID_idx").on(t.machineId),
    index("locations_staging_geog_idx").using("gist", t.geog),
  ],
)

export const locationRatings = pgTable(
  "location_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    text: text("text"),
    createdAt: createdAt(),
  },
  (t) => [
    index("location_ratings_location_id_idx").on(t.locationId),
    index("location_ratings_user_id_idx").on(t.userId),
    check("location_ratings_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
  ],
)

export const statusReports = pgTable(
  "status_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    status: locationStatus("status").notNull(),
    comment: text("comment"),
    createdAt: createdAt(),
  },
  (t) => [index("status_reports_location_created_idx").on(t.locationId, t.createdAt)],
)

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    planName: text("plan_name").notNull(),
    price: numeric("price", { mode: "number" }).notNull(),
    // Production has a default (start_date is optional on insert in the Supabase types).
    startDate: timestamp("start_date", { withTimezone: true }).notNull().defaultNow(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("subscriptions_user_id_idx").on(t.userId)],
)

export const trustRatings = pgTable("trust_ratings", {
  id: uuid("id").primaryKey().defaultRandom(),
  ratedUserId: uuid("rated_user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  raterUserId: uuid("rater_user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: createdAt(),
})
