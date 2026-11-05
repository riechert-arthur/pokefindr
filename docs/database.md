# Database

PokeFindr talks to Postgres 15+ with PostGIS through [Drizzle ORM](https://orm.drizzle.team).
Migrations are written by drizzle-kit and run by [Kysely's migrator](https://kysely.dev/docs/migrations),
which adds rollbacks.
The app only needs a connection string, so any provider that offers PostGIS
and a connection pooler works.

| What | Where |
|---|---|
| Schema (source of truth for types) | `src/server/db/schema/index.ts` |
| Connection | `src/server/db/client.ts` (`getDb()`) |
| Migrations (generated SQL, committed) | `drizzle/` |
| Down migrations (hand-written SQL) | `drizzle/down/` |
| Migration runner | `scripts/db/migrator.ts` |
| Config | `drizzle.config.ts` |

## Environment

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | the app | Pooled URL (PgBouncer/Supavisor in transaction mode, or the provider's pooled endpoint). Optional until request handlers use the database; `getDb()` throws without it. |
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
4. Write `drizzle/down/<same name>.sql` to undo it (see `drizzle/down/README.md`).
5. Check it both ways locally: `npm run db:migrate`, `npm run db:rollback`, `npm run db:migrate`.
6. Commit the schema change, the migration and its down file together. CI fails
   if the schema and migrations drift apart, or if a migration has no down file.

Migrations run in a deploy step (`npm run db:migrate`), never at app start-up.

## Running and rolling back migrations

```bash
npm run db:migrate                          # apply every pending migration
npm run db:status                           # list migrations and when each was applied
npm run db:rollback                         # undo the last applied migration
npm run db:rollback -- --to 0001_something  # undo every migration after 0001_something
```

How it works (`scripts/db/migrator.ts`):
- Migrations are the entries in `drizzle/meta/_journal.json`, run in name order.
  Up is `drizzle/<tag>.sql`, down is `drizzle/down/<tag>.sql`.
- Each applied migration is recorded by name in `kysely.kysely_migration`. The
  `kysely` schema keeps this out of `public`, so Supabase's API doesn't expose it.
- Everything pending runs in one transaction under a lock, so a failed
  migration leaves nothing half-applied and two deploys can't migrate at once.
- If an applied migration is missing from the journal, or a new one sorts
  before the last applied one (for example, a branch that merged late with an
  older number), the migrator stops with a "corrupted migrations" error
  instead of skipping it. Renumber the late migration with `drizzle-kit` and
  try again.
- A migration without a down file can't be rolled back: `db:rollback` fails
  and changes nothing. The baseline is like this on purpose.

**Production:** a rollback only undoes the schema. Vercel Instant Rollback
restores old code but not the old schema, so keep schema changes compatible
with the previous release (add first, remove in a later release), and read a
down file before running it on production: one that drops a column drops its
data.

**Switching branches locally:** roll back the branch's migrations before you
switch away (`npm run db:rollback -- --to <last migration on main>`), because the
down files stay on that branch. If you forget, `db:migrate` stops with the
"missing migration" error; recreate the local database instead.

**Geography columns:** drizzle-kit wraps `geography(point, 4326)` in quotes,
because it doesn't recognise the type. Any generated migration that adds or
alters such a column needs those quotes removed by hand. The unit tests fail
if a migration still has them.

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
   The generated Supabase types predate `locations."machineID"` (the weekly
   update upserts on it), so the schema includes it even though the types don't.
   Also confirm `locations_staging` exists (it comes from the Supabase
   migration `20260528000100_create_locations_staging.sql` on the ETL branch).
   If it doesn't, apply that migration first.
2. Record the baseline:
   ```bash
   DATABASE_URL_UNPOOLED=<prod direct url> npm run db:baseline -- --dry-run
   DATABASE_URL_UNPOOLED=<prod direct url> npm run db:baseline
   ```
   Both commands first compare the database with the baseline's snapshot
   (`scripts/db/schemaCheck.ts`): every table, column (type, nullability,
   default or not), primary key, index, foreign key, check constraint and enum
   the schema models. On any difference they list it and stop without recording
   anything. Fix `src/server/db/schema/index.ts`, regenerate the baseline, and
   run it again. Tables the schema doesn't model, views, row-level security and
   foreign keys into `auth` are not compared.
   Recording writes one row to `kysely.kysely_migration`, the same row
   `db:migrate` writes when it applies a migration.
3. From then on, `npm run db:migrate` applies only newer migrations.
