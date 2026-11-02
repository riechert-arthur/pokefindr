# Database

PokeFindr talks to Postgres 15+ with PostGIS through [Drizzle ORM](https://orm.drizzle.team).
The app only needs a connection string, so any provider that offers PostGIS
and a connection pooler works.

| What | Where |
|---|---|
| Schema (source of truth for types) | `src/server/db/schema/index.ts` |
| Connection | `src/server/db/client.ts` (`getDb()`) |
| Migrations (generated SQL, committed) | `drizzle/` |
| Config | `drizzle.config.ts` |

## Environment

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | the app | Pooled URL (PgBouncer/Supavisor in transaction mode, or the provider's pooled endpoint). Required at start-up. |
| `DATABASE_URL_UNPOOLED` | migrations | Direct URL. Falls back to `DATABASE_URL`. |
| `DATABASE_POOL_MAX` | the app | Connections per server instance (default 5). |

For the current Supabase project:
- `DATABASE_URL`: the Supavisor **transaction** pooler URL (port 6543).
- `DATABASE_URL_UNPOOLED`: the **session** pooler or direct URL (port 5432).

## Local development

```bash
npm run db:up          # PostGIS 16 on localhost:5433 (docker compose)
npm run db:migrate     # apply migrations
npm run dev
```

`.env.local` needs `DATABASE_URL=postgres://pokefindr:pokefindr@localhost:5433/pokefindr`.

Tests:

```bash
npx vitest run             # unit tests, no database needed
npm run test:integration   # creates and migrates pokefindr_test on the local server
```

## Changing the schema

1. Edit `src/server/db/schema/index.ts`.
2. Run `npm run db:generate -- --name short_description`.
3. Review the SQL in `drizzle/`. Edit it if needed (see the geography note below).
4. Commit the schema change and the migration together. CI fails if they drift apart.

Migrations run in a deploy step (`npm run db:migrate`), never at app start-up.

**Geography columns:** drizzle-kit wraps `geography(point, 4326)` in quotes,
because it doesn't recognise the type. Any generated migration that adds or
alters such a column needs those quotes removed by hand.

## Adopting the existing Supabase database (one time)

The production database already has these tables, so `0000_baseline.sql`
must be **recorded** there, not run:

1. Check that the schema in code matches production:
   ```bash
   DATABASE_URL_UNPOOLED=<prod direct url> npm run db:pull
   ```
   This writes `drizzle-introspect/` (gitignored). Compare it with
   `src/server/db/schema/index.ts`. Column types for `profiles.rating`,
   `subscriptions.price` and `subscriptions.start_date/end_date` were inferred
   from generated types and are the most likely to differ. Constraint and index
   names may differ too; that is harmless.
   Also confirm `locations_staging` exists (it comes from the Supabase
   migration `20260528000100_create_locations_staging.sql` on the ETL branch).
   If it doesn't, apply that migration first.
2. Record the baseline:
   ```bash
   DATABASE_URL_UNPOOLED=<prod direct url> npm run db:baseline -- --dry-run
   DATABASE_URL_UNPOOLED=<prod direct url> npm run db:baseline
   ```
3. From then on, `npm run db:migrate` applies only newer migrations.

## Rolling out map data from the database

The map reads `GET /api/locations` (cached under the `locations` tag) instead
of the bundled `src/data/vending_machines_mod.json`. Before deploying that change:

1. `npm run db:migrate`: adds the retailer/address/city/state/postcode and
   `is_active` columns.
2. `npm run db:backfill-locations` (dry run), then
   `npm run db:backfill-locations -- --apply`: fills those columns from the
   bundled JSON, matched on `machineID`. Existing coordinates are never overwritten.
3. Check the count: `select count(*) from locations where is_active and geog is not null`
   should match the number of machines on the current map (1,457 at the time of writing).

## Running the whole app in containers

```bash
npm run db:up && npm run db:migrate && npm run db:backfill-locations -- --apply
docker compose --profile app up --build   # http://localhost:3000
```

The production `Dockerfile` builds the Next.js standalone server. It works
on any container host (Fly, Railway, Render, Cloud Run, a VM). `GET /api/health`
returns 200 when the app can reach the database and 503 when it can't.
