/**
 * Database schema: the source of truth for table types and migrations.
 *
 * Mirrors the existing Supabase `public` schema, rebuilt from the generated
 * Supabase types. Column names match the live database exactly (including
 * the quoted "machineID"); TypeScript property names are camelCase.
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

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
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}

export const locations = pgTable("locations", locationColumns, (t) => [
  uniqueIndex("locations_machine_id_key").on(t.machineId),
  index("locations_geog_gist").using("gist", t.geog),
  index("locations_active_idx").on(t.isActive),
])

/** ETL landing table; same shape as `locations`. */
export const locationsStaging = pgTable("locations_staging", locationColumns, (t) => [
  uniqueIndex("locations_staging_machine_id_key").on(t.machineId),
])

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
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
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
