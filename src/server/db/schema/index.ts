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
 * - The views `active_subscriptions`, `latest_status_reports`,
 *   `location_rating_summary` and `user_trust_summary`, which are being
 *   replaced by typed queries in services.
 * - The legacy "Vending Machine Locations" table.
 */
import type { ReportAction, ReportReason, ReportResolution } from "@/lib/locations/reports"
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
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
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { geographyPoint } from "../geography"
import type { LocationKind } from "@/lib/types/locations"
import type { RejectReason, ShopSells, SubmissionKind, SubmissionStatus } from "@/lib/submissions/constants"
import type { Role } from "@/lib/auth/roles"

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow()

export const locationStatus = pgEnum("location_status", [
  "stocked",
  "out-of-stock",
  "out-of-order",
])

/**
 * Accounts, owned by Better Auth (src/server/auth/auth.ts, migration 0009):
 * who someone is (`users`), how they sign in (`accounts`: a password, or a
 * Google or Discord identity), their Better Auth sessions, and one-time
 * tokens (`verifications`: email confirmation, password reset). PokeFindr's
 * own data about a person is in `profiles`, which shares the user's id.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
)

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** "credential" for a password, else the OAuth provider ("google", "discord"). */
    providerId: text("provider_id").notNull(),
    /** The provider's id for the person (the user id for "credential"). */
    accountId: text("account_id").notNull(),
    /** The password hash (scrypt), for "credential" accounts. */
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_provider_account_key").on(t.providerId, t.accountId),
  ],
)

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
)

/** Better Auth's request counts per IP and endpoint, so its rate limits hold across server instances. */
export const authRateLimits = pgTable("auth_rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  /** Milliseconds since the epoch. */
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
})

// ── MCP OAuth (#134): Better Auth's jwt and mcp plugins ──────────────────

const tz = (name: string) => timestamp(name, { withTimezone: true })

/** Keys access tokens are signed with; the private key is encrypted. */
export const jwks = pgTable("jwks", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  alg: text("alg"),
  crv: text("crv"),
  createdAt: tz("created_at").notNull().defaultNow(),
  expiresAt: tz("expires_at"),
})

/** MCP clients that may ask people for access. */
export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    clientCredentialsScopes: text("client_credentials_scopes").array(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata"),
    createdAt: tz("created_at").defaultNow(),
    updatedAt: tz("updated_at").defaultNow(),
  },
  (t) => [index("oauth_clients_user_id_idx").on(t.userId)],
)

/** What tokens are for: the MCP server's account endpoint. */
export const oauthResources = pgTable("oauth_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes").array(),
  customClaims: jsonb("custom_claims"),
  dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
  disabled: boolean("disabled").default(false),
  policyVersion: integer("policy_version").default(1),
  metadata: jsonb("metadata"),
  createdAt: tz("created_at").defaultNow(),
  updatedAt: tz("updated_at").defaultNow(),
})

export const oauthClientResources = pgTable(
  "oauth_client_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull(),
    metadata: jsonb("metadata"),
    createdAt: tz("created_at").defaultNow(),
  },
  (t) => [
    index("oauth_client_resources_client_id_idx").on(t.clientId),
    index("oauth_client_resources_resource_id_idx").on(t.resourceId),
    // Named: the default name passes Postgres's 63 characters.
    foreignKey({ name: "oauth_client_resources_resource_id_fk", columns: [t.resourceId], foreignColumns: [oauthResources.identifier] }).onDelete("cascade"),
  ],
)

/** Columns both token tables have. */
const tokenColumns = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  scopes: text("scopes").array().notNull(),
  confirmation: jsonb("confirmation"),
  expiresAt: tz("expires_at"),
  revoked: tz("revoked"),
  createdAt: tz("created_at").defaultNow(),
})

export const oauthRefreshTokens = pgTable(
  "oauth_refresh_tokens",
  {
    ...tokenColumns(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    rotatedAt: tz("rotated_at"),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: tz("rotation_replay_expires_at"),
    authTime: tz("auth_time"),
  },
  (t) => [
    index("oauth_refresh_tokens_client_id_idx").on(t.clientId),
    index("oauth_refresh_tokens_session_id_idx").on(t.sessionId),
    index("oauth_refresh_tokens_user_id_idx").on(t.userId),
    index("oauth_refresh_tokens_authorization_code_id_idx").on(t.authorizationCodeId),
  ],
)

export const oauthAccessTokens = pgTable(
  "oauth_access_tokens",
  {
    ...tokenColumns(),
    token: text("token").unique(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    refreshId: uuid("refresh_id").references(() => oauthRefreshTokens.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("oauth_access_tokens_client_id_idx").on(t.clientId),
    index("oauth_access_tokens_session_id_idx").on(t.sessionId),
    index("oauth_access_tokens_user_id_idx").on(t.userId),
    index("oauth_access_tokens_authorization_code_id_idx").on(t.authorizationCodeId),
    index("oauth_access_tokens_refresh_id_idx").on(t.refreshId),
  ],
)

/** What a person allowed a client. */
export const oauthConsents = pgTable(
  "oauth_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    scopes: text("scopes").array().notNull(),
    createdAt: tz("created_at").defaultNow(),
    updatedAt: tz("updated_at").defaultNow(),
  },
  (t) => [index("oauth_consents_client_id_idx").on(t.clientId), index("oauth_consents_user_id_idx").on(t.userId)],
)

/** Client assertion ids already used, so one can't be replayed. */
export const oauthClientAssertions = pgTable(
  "oauth_client_assertions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: tz("expires_at").notNull(),
  },
  (t) => [index("oauth_client_assertions_expires_at_idx").on(t.expiresAt)],
)

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    fullName: text("full_name"),
    isVerified: boolean("is_verified"),
    onboarded: boolean("onboarded").notNull().default(false),
    rating: doublePrecision("rating"),
    metadata: jsonb("metadata"),
    /** member, moderator (reviews submissions) or admin (migration 0012). */
    role: text("role").$type<Role>().notNull().default("member"),
    createdAt: createdAt(),
    // Set by the ORM on every update; there is no database trigger for it.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // One username per person, in any case (migration 0010).
    uniqueIndex("profiles_username_lower_key").on(sql`lower(${t.username})`),
    check("profiles_role_check", sql`${t.role} in ('member', 'moderator', 'admin')`),
  ],
)

/**
 * Usernames held by a sign-up for a day (migration 0010), new email or taken.
 * Only a new email gets a profile, so without the hold, trying the same
 * username again would show whether the email already had an account.
 */
export const usernameHolds = pgTable("username_holds", {
  /** Lowercased. */
  username: text("username").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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
    /** An admin took it off the map (#153); also is_active = false. The import keeps it hidden. */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenBy: uuid("hidden_by").references((): AnyPgColumn => profiles.id, { onDelete: "set null" }),
    /** The address compared for duplicates (#154): normalize_address(address), migration 0016. */
    addressNormalized: text("address_normalized").generatedAlwaysAs(sql`normalize_address(address)`),
  },
  (t) => [
    uniqueIndex("locations_machine_id_key").on(t.machineId),
    index("locations_vending_address_idx").on(t.state, t.addressNormalized).where(sql`${t.kind} = 'vending'`),
    index("locations_geog_gist").using("gist", t.geog),
    // The viewport query (getLocationsInBbox) filters on planar boxes (migration 0002).
    index("locations_geog_geometry_gist").using("gist", sql`(${t.geog}::geometry)`),
    // What each kind's details table points at, so its rows match the location's kind (migration 0011).
    unique("locations_id_kind_key").on(t.id, t.kind),
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
    /** Set when someone acted on it (#153): open until then. */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => profiles.id, { onDelete: "set null" }),
    resolution: text("resolution").$type<ReportResolution>(),
  },
  (t) => [
    index("status_reports_location_created_idx").on(t.locationId, t.createdAt),
    index("status_reports_open_location_idx").on(t.locationId).where(sql`${t.resolvedAt} is null`),
    check("status_reports_resolution_check", sql`${t.resolution} in ('dismissed', 'fixed', 'hidden')`),
    check("status_reports_resolved_check", sql`(${t.resolvedAt} is null) = (${t.resolution} is null)`),
    index("status_reports_user_created_idx").on(t.userId, t.createdAt),
    check("status_reports_reason_check", sql`${t.reason} in ('gone', 'wrong_location', 'empty', 'other')`),
    check("status_reports_status_or_reason_check", sql`${t.status} is not null or ${t.reason} is not null`),
  ],
)

/** What was done with a location's reports (#153), kept as history. */
export const reportActions = pgTable(
  "report_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    action: text("action").$type<ReportAction>().notNull(),
    actedBy: uuid("acted_by").references(() => profiles.id, { onDelete: "set null" }),
    /** Reports it closed or reopened. */
    reports: integer("reports").notNull(),
    /** On a hide: whether the location was live before, so Reopen puts back what was there. */
    wasActive: boolean("was_active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("report_actions_location_created_idx").on(t.locationId, t.createdAt),
    check("report_actions_action_check", sql`${t.action} in ('dismiss', 'fix', 'hide', 'reopen')`),
  ],
)

/** How a job run ended (#157). */
export const JOB_RUN_STATUSES = ["running", "succeeded", "failed", "skipped"] as const
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number]

/** One row per job run (#157): written by runJob and the location import. */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job").notNull(),
    /** cron, queue, http, inline, cli, or deploy (the location import). */
    trigger: text("trigger").notNull(),
    status: text("status").$type<JobRunStatus>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** The job's counts. */
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
  },
  (t) => [
    index("job_runs_job_started_idx").on(t.job, t.startedAt),
    check("job_runs_status_check", sql`${t.status} in ('running', 'succeeded', 'failed', 'skipped')`),
  ],
)

/** A paused job (#157): cron runs skip it, and queue messages wait until it is resumed. */
export const jobPauses = pgTable("job_pauses", {
  job: text("job").primaryKey(),
  reason: text("reason").notNull(),
  pausedBy: uuid("paused_by").references(() => profiles.id, { onDelete: "set null" }),
  pausedAt: timestamp("paused_at", { withTimezone: true }).notNull().defaultNow(),
})

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

/**
 * A card shop or event someone sent in (migration 0011), waiting for a
 * moderator. `payload` is what they filled in, checked per kind by the API
 * (src/lib/submissions/schemas.ts). Approving one creates the location and
 * sets `location_id`; rejecting one needs a `reject_reason`.
 */
export const locationSubmissions = pgTable(
  "location_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<SubmissionKind>().notNull(),
    payload: jsonb("payload").notNull(),
    geog: geographyPoint("geog").notNull(),
    submittedBy: uuid("submitted_by").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status").$type<SubmissionStatus>().notNull().default("pending"),
    rejectReason: text("reject_reason").$type<RejectReason>(),
    reviewedBy: uuid("reviewed_by").references(() => profiles.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    createdAt: createdAt().notNull(),
  },
  (t) => [
    index("location_submissions_submitted_by_created_idx").on(t.submittedBy, t.createdAt),
    index("location_submissions_status_created_idx").on(t.status, t.createdAt),
    index("location_submissions_geog_gist").using("gist", t.geog),
    check("location_submissions_kind_check", sql`${t.kind} in ('shop', 'event')`),
    check("location_submissions_status_check", sql`${t.status} in ('pending', 'approved', 'rejected')`),
    check("location_submissions_reject_reason_check", sql`${t.rejectReason} in ('duplicate', 'not_real', 'wrong_details', 'spam')`),
    check("location_submissions_rejected_reason_check", sql`(${t.status} = 'rejected') = (${t.rejectReason} is not null)`),
  ],
)

/** A card shop's own fields (migration 0011). `kind` is always 'shop', so the row can only belong to a shop. */
export const cardShopDetails = pgTable(
  "card_shop_details",
  {
    locationId: uuid("location_id").primaryKey(),
    kind: text("kind").$type<"shop">().notNull().default("shop"),
    website: text("website"),
    hours: text("hours"),
    sells: text("sells").array().$type<ShopSells[]>().notNull(),
  },
  (t) => [
    foreignKey({ name: "card_shop_details_location_fk", columns: [t.locationId, t.kind], foreignColumns: [locations.id, locations.kind] }).onDelete("cascade"),
    check("card_shop_details_kind_check", sql`${t.kind} = 'shop'`),
  ],
)

/**
 * An event's own fields (migration 0011): the one place its times live.
 * Without `ends_at`, an event lasts a day.
 */
export const eventDetails = pgTable(
  "event_details",
  {
    locationId: uuid("location_id").primaryKey(),
    kind: text("kind").$type<"event">().notNull().default("event"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    venue: text("venue"),
    link: text("link"),
    isFree: boolean("is_free"),
  },
  (t) => [
    index("event_details_starts_at_idx").on(t.startsAt),
    index("event_details_ends_at_idx").on(t.endsAt),
    foreignKey({ name: "event_details_location_fk", columns: [t.locationId, t.kind], foreignColumns: [locations.id, locations.kind] }).onDelete("cascade"),
    check("event_details_kind_check", sql`${t.kind} = 'event'`),
    check("event_details_dates_check", sql`${t.endsAt} is null or ${t.endsAt} >= ${t.startsAt}`),
  ],
)

/**
 * Emails for an event, keyed by event and recipient, so a retried job sends
 * each once (migration 0013): claimed, then `sent_at` once the mailer took it.
 */
export const sentNotifications = pgTable(
  "sent_notifications",
  {
    key: text("key").primaryKey(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("sent_notifications_claimed_at_idx").on(t.claimedAt)],
)
