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
import type { ReportReason } from "@/lib/locations/reports"
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgMaterializedView,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { geographyPoint } from "../geography"
import type { LocationKind } from "@/lib/types/locations"

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
  /** vending, shop or event (LOCATION_KINDS). */
  kind: text("kind").$type<LocationKind>().notNull().default("vending"),
  /** ISO 3166-1 alpha-2. `state` is the admin region within it. */
  countryCode: text("country_code").notNull().default("US"),
  /** The full feature properties from the JSON, kept while the data moves off it. */
  raw: jsonb("raw"),
  // Set on every update by the locations_set_updated_at trigger (migration 0001), whoever writes.
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date()),
}

/** Checks shared by `locations` and `locations_staging` (migration 0002). */
const locationChecks = (table: string, t: { kind: AnyPgColumn; countryCode: AnyPgColumn }) => [
  check(`${table}_kind_check`, sql`${t.kind} in ('vending', 'shop', 'event')`),
  check(`${table}_country_code_check`, sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
]

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
    // The viewport query (getLocationsInBbox) filters on planar boxes (migration 0002).
    index("locations_geog_geometry_gist").using("gist", sql`(${t.geog}::geometry)`),
    ...locationChecks("locations", t),
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
    ...locationChecks("locations_staging", t),
  ],
)

/**
 * Active, positioned locations per country, region (state; '' when unknown)
 * and kind (migration 0003). Refreshed by the `refresh-region-counts` job.
 * `.existing()`: the migration owns its definition, so drizzle-kit leaves it alone.
 */
export const locationRegionCounts = pgMaterializedView("location_region_counts", {
  country: text("country").notNull(),
  region: text("region").notNull(),
  kind: text("kind").$type<LocationKind>().notNull(),
  count: integer("count").notNull(),
}).existing()

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

/** What a highlight is (migration 0004). */
export const HIGHLIGHT_KINDS = ["event", "featured"] as const
export type HighlightKind = (typeof HIGHLIGHT_KINDS)[number]

/**
 * Featured events and places for the zoomed-out map (migration 0004). At a
 * location or at its own point; `is_sample` marks invented rows.
 */
export const highlights = pgTable(
  "highlights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<HighlightKind>().notNull(),
    title: text("title").notNull(),
    description: text("description"),
    /** Required for events. */
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
    geog: geographyPoint("geog"),
    city: text("city"),
    state: text("state"),
    isPublished: boolean("is_published").notNull().default(true),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt().notNull(),
  },
  (t) => [
    index("highlights_starts_at_idx").on(t.startsAt),
    check("highlights_kind_check", sql`${t.kind} in ('event', 'featured')`),
    check("highlights_place_check", sql`${t.locationId} is not null or ${t.geog} is not null`),
    check("highlights_dates_check", sql`${t.endsAt} is null or ${t.startsAt} is null or ${t.endsAt} >= ${t.startsAt}`),
    check("highlights_event_starts_check", sql`${t.kind} <> 'event' or ${t.startsAt} is not null`),
  ],
)

export const statusReports = pgTable(
  "status_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    status: locationStatus("status"),
    /** Why the location is wrong ("Report a problem", migration 0005). */
    reason: text("reason").$type<ReportReason>(),
    comment: text("comment"),
    createdAt: createdAt(),
  },
  (t) => [
    index("status_reports_location_created_idx").on(t.locationId, t.createdAt),
    index("status_reports_user_created_idx").on(t.userId, t.createdAt),
    check("status_reports_reason_check", sql`${t.reason} in ('gone', 'wrong_location', 'empty', 'other')`),
    check("status_reports_status_or_reason_check", sql`${t.status} is not null or ${t.reason} is not null`),
  ],
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

/** The assistant's usage per user and UTC day (migration 0006), for its limits and spend caps. */
export const assistantUsage = pgTable(
  "assistant_usage",
  {
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    messages: integer("messages").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** Millionths of a dollar. */
    costMicros: integer("cost_micros").notNull().default(0),
  },
  (t) => [uniqueIndex("assistant_usage_user_day_key").on(t.userId, t.day), index("assistant_usage_day_idx").on(t.day)],
)

/** The distinct places the assistant showed each user each day (migration 0006). */
export const assistantPlaceViews = pgTable(
  "assistant_place_views",
  {
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("assistant_place_views_user_day_location_key").on(t.userId, t.day, t.locationId)],
)

export const ASSISTANT_OUTCOMES = ["answered", "refused", "tool_limit", "max_tokens", "error", "stopped", "limited", "paused"] as const
export type AssistantOutcome = (typeof ASSISTANT_OUTCOMES)[number]

/** One assistant turn, without its text (migration 0007): for cost, abuse review and feedback. */
export const assistantTurns = pgTable(
  "assistant_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    outcome: text("outcome").$type<AssistantOutcome>().notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** Millionths of a dollar. */
    costMicros: integer("cost_micros").notNull().default(0),
    latencyMs: integer("latency_ms"),
    /** The tools it ran, names only: `{ name, ok }[]` (inputs are text, kept in assistant_turn_texts). */
    tools: jsonb("tools").$type<{ name: string; ok: boolean }[]>().notNull().default(sql`'[]'::jsonb`),
    /** Why it might need a look: refused, injection, place_cap, cost_outlier. */
    flags: text("flags").array().notNull(),
    /** Which system prompt and tools answered (migration 0008). */
    promptVersion: text("prompt_version"),
  },
  (t) => [
    index("assistant_turns_user_created_idx").on(t.userId, t.createdAt),
    index("assistant_turns_created_idx").on(t.createdAt),
    check("assistant_turns_outcome_check", sql`${t.outcome} in ('answered', 'refused', 'tool_limit', 'max_tokens', 'error', 'stopped', 'limited', 'paused')`),
  ],
)

/** A turn's question and answer (migration 0007), deleted after 30 days or on request. */
export const assistantTurnTexts = pgTable(
  "assistant_turn_texts",
  {
    turnId: uuid("turn_id").primaryKey().references(() => assistantTurns.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull().default(""),
    /** The tools' inputs and errors: `{ name, input, ok, error? }[]`. */
    toolCalls: jsonb("tool_calls").$type<{ name: string; input: unknown; ok: boolean; error?: string }[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assistant_turn_texts_created_idx").on(t.createdAt)],
)

export const FEEDBACK_REASONS = ["wrong_place", "outdated", "misunderstood", "other"] as const
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number]

/** A viewer's thumbs up (1) or down (-1) on an assistant answer (migration 0008). */
export const assistantFeedback = pgTable(
  "assistant_feedback",
  {
    turnId: uuid("turn_id").primaryKey().references(() => assistantTurns.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    vote: smallint("vote").notNull(),
    reason: text("reason").$type<FeedbackReason>(),
    /** Written by the viewer; cleared with the turn's text after 30 days. */
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("assistant_feedback_created_idx").on(t.createdAt),
    check("assistant_feedback_vote_check", sql`${t.vote} in (-1, 1)`),
    check("assistant_feedback_reason_check", sql`${t.reason} in ('wrong_place', 'outdated', 'misunderstood', 'other')`),
  ],
)
