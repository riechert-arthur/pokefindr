# Plan: Re-architect on Postgres + ORM

**Goal:** Move the app's data layer off the Supabase JS client and onto a typed ORM over plain Postgres. The provider can be chosen later. The map renders its points from the database, not from a bundled JSON file.

**Status:** Proposal · 2026-11-01 · supersedes the Supabase-specific parts of `plans/location_etl_async_pipeline.md` (RPCs, `supabase/migrations`). The ETL/ingestion scripts are out of scope here.

---

## 1. Current state

### Data access

Every query goes through `@supabase/supabase-js` (`src/lib/supabase/db.ts`). There are two clients: `db` (anon key) and `adminDB` (service role).

| Area | Files | Supabase features used |
|------|-------|------------------------|
| Map points | `MapInstance.tsx`, `LocationInfoPanel.tsx` | **None.** They import `src/data/vending_machines_mod.json` (4 MB, bundled at build time) |
| Reviews | `api/reviews`, `api/reviews/[id]`, `api/get-reviews`, `api/my-reviews` | `.from()`, embedded joins (`locations!inner`), RPCs `add_review_for_location` and `get_location_by_point` (PostGIS, 50 m radius) |
| Profiles/settings | `api/auth/user`, `api/user-settings`, `api/auth/onboarding`, `api/auth/signup` | `.from('profiles')`, `.from('subscriptions')` |
| Auth | `src/lib/supabase/auth.ts`, `api/auth/{login,signup,confirm,oauth,callback,onboarding,logout}` | Supabase Auth: password sign-in, sign-up, `verifyOtp`, OAuth, `auth.admin.*` |
| Session | `src/middleware.ts`, `api/auth/login` | Own JWT (`app_session` cookie, `jose`/`jsonwebtoken`). Doesn't depend on Supabase |
| Legacy | `src/lib/map/locations.ts` | `"Vending Machine Locations"` table. Appears unused |

### Schema (from `database.types.ts`, which is partly stale)

- **Tables:** `locations` (geog, name, description, is_official, created_by, plus `machineID`, which the generated types are missing), `location_ratings`, `status_reports` (enum `location_status`: stocked / out-of-stock / out-of-order), `profiles`, `subscriptions`, `trust_ratings`, `locations_staging`, `"Vending Machine Locations"`
- **Views:** `active_subscriptions`, `latest_status_reports`, `location_rating_summary`, `user_trust_summary`
- **Functions:** `add_review_for_location`, `get_location_by_point`

### Problems this re-architecture should fix

1. **The map can't show what's in the database.** Points ship with the build.
2. **Reviews are joined to the map by coordinates.** The flow is: click a point, take its lat/lng, find the nearest `locations` row within 50 m, then read reviews. Points that are close together, or that moved, get the wrong reviews. The client also finds machines by `feature_index`, a position in the JSON array.
3. **Business logic lives in two places.** Some is in SQL functions and views (invisible to TypeScript), and some is in route handlers. There's no single place to read or test it.
4. **Types are hand-generated and drift.** `machineID` is missing from `database.types.ts`.
5. **Lock-in.** Both auth and data access depend on Supabase-specific APIs, which blocks choosing another Postgres provider.

---

## 2. Target architecture

```
 Browser (Map, panels)
   │  fetch /api/locations            (GeoJSON, cached; tag "locations")
   │  fetch /api/locations/:id        (details + rating summary + latest status)
   │  fetch /api/locations/:id/reviews
   ▼
 Next.js on Vercel (Node runtime, Fluid Compute)
   ├─ middleware.ts ── JWT check only (no DB access, unchanged)
   ├─ app/api/**/route.ts ── thin: parse (zod) → call service → respond
   └─ src/server/
        ├─ services/   locations.ts, reviews.ts, statusReports.ts, users.ts
        │              (business rules + authorization; the only callers of db)
        ├─ db/
        │   ├─ schema/   Drizzle table definitions (source of truth for types)
        │   ├─ client.ts pooled connection, one per function instance
        │   └─ queries/  reusable SQL fragments (PostGIS, GeoJSON)
        └─ auth/       session issue/verify, password + OAuth (provider-agnostic)
   ▼
 Postgres 15+ with PostGIS  (provider TBD; reached only via DATABASE_URL)
   └─ drizzle/ migrations (generated SQL, committed, applied in CI)
```

Principles:
- **The ORM schema is the source of truth.** Types come from the schema with no codegen step, and migrations are generated from it.
- **Only `src/server/services` talks to the database.** Route handlers and server components call services. Client components never import anything from `src/server`.
- **IDs, not coordinates.** Every map feature carries `location.id`. Reviews, status reports, and details are fetched by ID.
- **Provider-agnostic.** No provider SDK in the app. The only dependencies are standard Postgres features: a URL, PostGIS, and a pooler.

---

## 3. ORM choice

**Decision: Drizzle ORM** (`drizzle-orm` + `drizzle-kit`) for the schema and queries, with migrations run by Kysely's `Migrator` for up/down and rollbacks. Kysely, TypeORM and Prisma were also compared for rollbacks and PostGIS; see `plans/orm_migrations_decision.md` for the tradeoffs.

| | Drizzle | Prisma |
|---|---|---|
| PostGIS | Built-in `geometry` point column only; our `geography(Point, 4326)` needs a custom type. Raw `sql\`ST_…\`` drops in typed anywhere | Prisma 7: `Unsupported("geography")`, so every spatial read or write needs `$queryRaw`. Prisma 8 (RC) adds a `Geometry` extension |
| Serverless / Vercel | Thin, no engine binary. Works with `postgres-js`, `node-postgres`, and Neon's serverless driver | Better in v6/v7 (driver adapters, no Rust engine), but a heavier client and generation step |
| Migrations | `drizzle-kit generate` → plain SQL files you can edit (needed for extensions, views, GiST indexes). Forward-only: no down migrations | `prisma migrate`. Views and extensions need manual SQL. Rollback only for failed migrations |
| Introspect existing DB | `drizzle-kit pull` | `prisma db pull` |
| Auth library support | Better Auth and Auth.js both have adapters | Both have adapters |

The plan below doesn't depend on Drizzle-specific features except the PostGIS column helper.

**Driver:** `postgres` (postgres-js) by default. If the provider has a serverless HTTP/WebSocket driver (for example `@neondatabase/serverless`), switch only `client.ts`.

---

## 4. Database provider (to be decided)

Hard requirements:
1. **PostGIS** extension available.
2. **Connection pooling** suited to serverless (PgBouncer or Supavisor in transaction mode, or an HTTP driver). Vercel functions scale out, and each instance holds connections.
3. Region close to the Vercel functions' region (default `iad1`).
4. Daily backups with point-in-time restore.

Nice to have: database branching for preview deploys, Vercel Marketplace integration (env vars injected automatically), free tier for dev.

| Option | Notes |
|---|---|
| **Neon** (also what Vercel Postgres became) | PostGIS ✓, pooled URL ✓, branching per preview deploy ✓, Vercel Marketplace ✓. Scale-to-zero adds cold-start latency on the first query |
| **Supabase (Postgres only)** | Zero-migration path: keep the current DB and point Drizzle at the Supavisor URL. PostGIS ✓. Lets us decouple code first and move data later (or never) |
| **AWS RDS / Aurora** | Most control, but no built-in pooler (add RDS Proxy), no branching, more ops |
| **Railway / Render / Crunchy Bridge** | Plain managed Postgres with PostGIS. Pooling and branching vary by provider |

**Suggested path:** phase 1–3 run against the **existing Supabase Postgres** via `DATABASE_URL` (Supavisor transaction mode, `prepare: false`). That turns "pick a provider" into a data move that can happen at any point (phase 5).

---

## 5. Schema

Start with `drizzle-kit pull` against the current database, then clean up. Proposed final shape:

```ts
// src/server/db/schema/locations.ts
export const locationStatus = pgEnum('location_status', ['stocked', 'out-of-stock', 'out-of-order'])

export const locations = pgTable('locations', {
  id:           uuid('id').primaryKey().defaultRandom(),
  externalId:   text('external_id').unique(),              // was "machineID"; null for user-submitted
  retailer:     text('retailer'),
  name:         text('name'),
  address:      text('address'),
  city:         text('city'),
  state:        text('state'),
  postalCode:   text('postal_code'),
  point:        geometry('point', { type: 'point', mode: 'xy', srid: 4326 }).notNull(),
  isOfficial:   boolean('is_official').notNull().default(false),
  isActive:     boolean('is_active').notNull().default(true),
  createdBy:    uuid('created_by').references(() => users.id),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('locations_point_gist').using('gist', t.point),
  index('locations_active_idx').on(t.isActive),
])
```

Other tables, by name only (columns kept from today):
- `users`: owned by the auth layer (§7). Replaces Supabase `auth.users`.
- `profiles`: 1:1 with `users` (username, full_name, is_verified, rating, metadata).
- `subscriptions`: user_id, plan_name, status, period dates.
- `location_ratings` → rename to `reviews`: `location_id` FK, `user_id` FK, rating 1–5 (CHECK), text, timestamps. `unique(location_id, user_id)` if one review per user per location is the rule.
- `status_reports`: `location_id`, `user_id`, `status` enum, comment, `created_at`.
- `trust_ratings`: keep as is.

Changes from today:
- **Structured address columns** instead of a single `description` string. The map popup needs `address`/`city`/`state`/`retailer`, which today only exist in the JSON file.
- **`geometry(Point, 4326)` instead of `geography`.** It has better ORM support. Use `ST_DWithin(point::geography, …, meters)` when meter distances are needed. Either type works, so pick one and use it everywhere.
- **`externalId` in snake_case.** Quoted mixed-case `"machineID"` is a nuisance in raw SQL.
- **Views become TypeScript queries** in services (rating summary, latest status, active subscriptions, trust summary). The two RPCs are dropped. A view stays a view only when it's measurably faster, defined with Drizzle `pgView`.
- **Drop:** `"Vending Machine Locations"`, `src/lib/map/locations.ts`, and RLS policies (authorization moves to services, because the app connects as one DB role).
- **Keep `locations_staging`** in the schema so the future ingestion work has a target. How it's loaded is out of scope here.

Migrations live in `drizzle/` and are generated by `drizzle-kit generate`. Hand-edit them for `CREATE EXTENSION IF NOT EXISTS postgis` and the GiST index. They're applied by `npm run db:migrate` (Kysely's `Migrator`, `scripts/db/migrator.ts`) in a CI step before a production deploy, never at runtime. Each has a hand-written down file in `drizzle/down/` for `npm run db:rollback`. Schema changes still go in two steps (add, then remove later); see `plans/orm_migrations_decision.md` §7.

---

## 6. Rendering points from the database

### Endpoints

| Route | Returns | Caching |
|---|---|---|
| `GET /api/locations` | GeoJSON `FeatureCollection` of active locations. Properties: `id`, `retailer`, `name`, `address`, `city`, `state`, `avgRating`, `reviewCount`, `latestStatus` | `unstable_cache` / `"use cache"` with tag `locations`, `revalidate: 3600`, plus `Cache-Control: s-maxage` |
| `GET /api/locations/:id` | Single location with rating summary and latest status report | Tag `location:{id}` |
| `GET /api/locations/:id/reviews` | Reviews with usernames | Tag `location:{id}:reviews` |
| `POST /api/locations/:id/reviews` | Create review (auth) | Calls `revalidateTag('location:{id}:reviews')` and `revalidateTag('locations')` |
| `POST /api/locations/:id/status` | Create status report (auth) | Same pattern |

Postgres builds the GeoJSON in one query, so there's no N+1 or mapping in JS:

```ts
// src/server/db/queries/geojson.ts
export const activeLocationsGeoJSON = () => db.execute(sql`
  select json_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(json_agg(json_build_object(
      'type', 'Feature',
      'id', l.id,
      'geometry', ST_AsGeoJSON(l.point)::json,
      'properties', json_build_object(
        'id', l.id, 'retailer', l.retailer, 'name', l.name,
        'address', l.address, 'city', l.city, 'state', l.state,
        'avgRating', s.avg_rating, 'reviewCount', s.review_count)
    )), '[]'::json)
  ) as fc
  from ${locations} l
  left join lateral (
    select round(avg(rating)::numeric, 1) as avg_rating, count(*) as review_count
    from ${reviews} r where r.location_id = l.id
  ) s on true
  where l.is_active
`)
```

### Client changes

- **`MapInstance.tsx`:** remove `import machineData from "@/data/vending_machines_mod.json"`. Better option: make `map/page.tsx` a server component that calls `locationsService.getActiveGeoJSON()` and passes `collection` to the client map, so points are in the first HTML with no loading flash. Alternative: fetch `/api/locations` with SWR.
- **`PokemonCenterLocationPins.tsx`:** the `<Source>` is memoised with `[]`, so it never sees new data. Depend on `collection`. Use `promoteId="id"` on the source so feature state and clicks carry the database ID.
- **`LocationInfoPanel.tsx`:** remove the JSON import and `feature_index`. Load details and reviews by `info.id`.
- **`MapSearchBar.tsx`** (fuse.js over features): search the same `collection` prop. No change in behaviour.
- Remove `feature_index` from `MachineProperties` and `LocationPopupProps`, and add `id: string`.

### Scale

There are ~1.5k points today. The GeoJSON payload with the properties above is roughly 300 KB raw and ~60 KB gzipped, so one cached response is the right call. Revisit only past ~50k points:
1. `GET /api/locations?bbox=…` with `ST_MakeEnvelope` on the GiST index, or
2. Vector tiles: `GET /api/tiles/{z}/{x}/{y}` using `ST_AsMVT`, cached at the CDN.

---

## 7. Auth

The current auth runs on Supabase Auth (password, OTP email confirm, OAuth, admin user updates). If the provider might not be Supabase, auth has to move to the app's own Postgres.

**Recommendation: Better Auth** with its Drizzle adapter. It covers email/password, email verification, OAuth providers, and sessions, and keeps users and sessions in our own `users` / `sessions` / `accounts` tables. Auth.js (NextAuth v5) also works, but its credentials support is weaker. Rolling our own (current JWT plus bcrypt) is possible, but it means owning email verification, password reset, and OAuth.

Migration details:
- **Users:** copy `auth.users` (id, email, email_confirmed_at, created_at) into `users`, keeping the **same UUIDs** so `profiles`, `reviews`, and `subscriptions` foreign keys stay valid.
- **Passwords:** Supabase stores bcrypt hashes in `auth.users.encrypted_password`. Configure Better Auth's password verify to accept bcrypt, so existing users log in without a reset. If that isn't possible, force a password reset for every user. Decide before cutover.
- **OAuth:** re-register the redirect URIs with each provider for the new callback route.
- **Middleware:** keeps verifying a cookie with no DB access. With Better Auth, switch to its cookie-cache session check, or keep issuing the `app_session` JWT (`sub`, `tier`) after login, which leaves `middleware.ts` unchanged.

Auth is the riskiest part of the plan and doesn't block rendering points, so it's a later phase (phase 4). Until then it stays on Supabase Auth, and only `users`-related foreign keys point at `auth.users`.

---

## 8. Vercel specifics

- **Runtime:** every route that touches the database uses the Node runtime (the default). Middleware stays on Edge and never imports `src/server/db`.
- **Connection management** in `src/server/db/client.ts`:
  ```ts
  import postgres from 'postgres'
  import { drizzle } from 'drizzle-orm/postgres-js'
  import * as schema from './schema'

  const client = postgres(process.env.DATABASE_URL!, {
    max: 5,               // per function instance; Fluid Compute reuses instances
    prepare: false,       // required behind PgBouncer/Supavisor transaction mode
    idle_timeout: 20,
  })
  export const db = drizzle(client, { schema, casing: 'snake_case' })
  ```
  Use a module-level singleton, with a `globalThis` guard in dev so hot reloads don't leak connections. Don't use `@vercel/functions`' `attachDatabasePool`: it only supports `pg`-style pools and throws "Unsupported database pool type" for postgres-js. `idle_timeout` closes idle connections instead.
- **Env vars:**
  - `DATABASE_URL`: pooled, used at runtime.
  - `DATABASE_URL_UNPOOLED`: direct, used by migrations only.
  - Remove `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY` once phase 4 is done.
- **Preview deploys:** with a branching provider, each preview gets its own DB branch and migrations run against it. Without one, previews share a `staging` database, never production.
- **Build:** pages that read points must not query at build time without a DB. Mark them dynamic, or rely on the cache plus revalidate.

---

## 9. Testing

- **Unit tests:** services take `db` as a parameter (or a module that can be mocked), so business rules (one review per user, rating bounds, authorization) are tested without a DB.
- **Integration tests:** a real Postgres with PostGIS in Docker (`postgis/postgis:16-3.4`), started by Vitest global setup, with migrations applied. Each test runs in a rolled-back transaction. Covers the GeoJSON query, distance queries, and FK behaviour.
- **CI:** GitHub Actions service container `postgis/postgis`, run `npm run db:migrate`, then `vitest`. The existing component tests in `__tests__/components` don't change.
- **Contract test:** `/api/locations` returns valid GeoJSON with an `id` on every feature (catches regressions in what the map needs).

---

## 10. Rollout

Each phase ships on its own and leaves the app working.

1. **Foundation:** add Drizzle, `drizzle-kit pull` the current Supabase DB into `src/server/db/schema`, add `client.ts`, `DATABASE_URL`, and the CI migration step. No behaviour change.
2. **Locations from DB:**
   - Migration adds the structured address columns, `is_active`, `external_id`, and the GiST index.
   - Backfill from `vending_machines_mod.json` once (one-off TS script), matched on `machineID`.
   - Ship `/api/locations` and the server-rendered map page, with features carrying `id`.
   - Keep the JSON import as a fallback behind a flag for one release, then delete `src/data/vending_machines*.json`.
3. **Reviews and status by ID:**
   - Move `reviews`, `get-reviews`, `my-reviews`, `reviews/[id]`, and status reports to services, keyed by `location_id`.
   - Drop `add_review_for_location` and `get_location_by_point`.
   - Replace the views with service queries.
   - Move profile and subscription reads and writes to Drizzle.
4. **Auth off Supabase:** Better Auth, user and hash migration, OAuth re-registration, middleware compatibility. Remove `@supabase/supabase-js` and `database.types.ts`.
5. **Choose and move provider (optional):** `pg_dump --no-owner` from Supabase, restore to the chosen provider, `npm run db:migrate` to confirm there's no drift, switch `DATABASE_URL`, and keep Supabase read-only for a rollback window.

Phases 1–3 deliver the goal of rendering points from Postgres through an ORM. Phases 4–5 remove the lock-in.

---

## 11. Open questions

1. ~~**ORM:** Drizzle (recommended) or Prisma?~~ Decided: Drizzle (2026-11-04, `plans/orm_migrations_decision.md`).
2. **Auth:** Better Auth (recommended), Auth.js, or keep Supabase Auth for good (which effectively makes Supabase the provider)?
3. **Password migration:** can we read `auth.users.encrypted_password` from the current project? If not, plan a forced password reset.
4. **Reviews:** one review per user per location, or many?
5. **User-submitted locations:** in scope now (`created_by`, `is_official=false`, moderation), or later?
6. **Provider shortlist:** is Vercel Marketplace integration or DB branching for previews a must-have? That points to Neon.
