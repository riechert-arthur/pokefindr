# Database

PokeFindr talks to Postgres 15+ with PostGIS through [Drizzle ORM](https://orm.drizzle.team).
Migrations are TypeScript files written with [Kysely](https://kysely.dev/docs/migrations)'s
schema builder and run by Kysely's migrator, which adds rollbacks.
The app only needs a connection string, so any provider that offers PostGIS
and a connection pooler works.

| What | Where |
|---|---|
| Schema (source of truth for types) | `src/server/db/schema/index.ts` |
| Connection | `src/server/db/client.ts` (`getDb()`) |
| Migrations (Kysely, `up` and `down` in one file) | `database/migrations/` |
| Migration runner | `scripts/db/migrator.ts` |
| Drift check (migrations vs. schema) | `scripts/db/drift.ts` |
| drizzle-kit config (`db:pull`, `db:studio`) | `drizzle.config.ts` |

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

Everything runs in Docker (`docker-compose.yml`), so the host only needs Docker and make:

```bash
make run     # start or update the whole stack; open http://localhost:3000
```

`make run` is idempotent. The first time, it creates `.env.local`, builds the
dev image, installs dependencies, starts PostGIS, applies migrations and seeds
locations. After that it only does what changed: new dependencies after a
change to `package-lock.json`, and new migrations after a pull. A running web
server isn't restarted.

| Service | What it does |
|---|---|
| `db` | PostGIS 16, also published on localhost:5433 for host tools |
| `init` | Runs once per `make run`: installs dependencies if needed, `db:migrate`, `db:check`, `db:seed` |
| `web` | `next dev` on localhost:3000, with hot reload. Starts after `init` succeeds |

Workers will be services that share the app's definition (`x-app` in
`docker-compose.yml`, which has an example) and start after `init`, so
`make run` brings them up too.

Other commands: `make stop`, `make logs`, `make shell` (a shell in the web
container), and `make reset`, which **deletes** the local database and
dependency volumes and starts again.

Notes:
- `.env.local` is created from `.env.template` with a random `JWT_SECRET`, and
  never edited after that. `make run` stops with a list of the variables the
  app needs at start-up that are still empty. Placeholder Supabase values are
  enough to use the map.
- The containers always use the stack's own database, whatever `DATABASE_URL`
  in `.env.local` says. `.env.local`'s `DATABASE_URL` is for host tools such as
  `npm run db:studio` or running `npm run dev` outside Docker.
- `node_modules` and `.next` live in Docker volumes. For editor type checking
  and the tests below, also run `npm install` on the host.
- If a port is taken: `make run WEB_PORT=3001 DB_PORT=5434`.
- **A local database from before migrations existed** (tables but no
  `kysely` schema) makes `init` fail because the tables already exist. Run
  `make reset`, or record the baseline with `npm run db:baseline` from the host.

Tests:

```bash
npx vitest run             # unit tests, no database needed
npm run test:integration   # creates and migrates pokefindr_test on the local server
```

## Changing the schema

1. Edit `src/server/db/schema/index.ts`.
2. Add `database/migrations/<NNNN>_short_description.ts`, numbered after the
   last one, that exports `up(db)` and `down(db)`:
   ```ts
   import type { Kysely } from "kysely"

   export async function up(db: Kysely<unknown>): Promise<void> {
     await db.schema.alterTable("profiles").addColumn("nickname", "text").execute()
   }

   export async function down(db: Kysely<unknown>): Promise<void> {
     await db.schema.alterTable("profiles").dropColumn("nickname").execute()
   }
   ```
   Use the schema builder (`db.schema`). Pass a `sql` fragment only for what it
   can't express, such as a default (`` sql`now()` ``) or a type like
   `` sql`geography(point, 4326)` ``. Name indexes and constraints the way the
   Drizzle schema does. `down` undoes `up` in reverse order.
3. Run `make run` (or `npm run db:migrate`, then `npm run db:check`). If the database doesn't
   match the schema, `db:check` prints the SQL drizzle-kit would run to fix it.
   That shows what the migration is missing. It ignores what the schema leaves
   out on purpose (the legacy table and views listed in `scripts/db/drift.ts`,
   row-level security and foreign keys into `auth`), so it also works against
   Supabase. If a difference could be a rename, it stops and asks you to write
   the rename migration instead of guessing.
4. Check it both ways: `npm run db:rollback`, then `npm run db:migrate`.
5. Commit the schema change and the migration together. CI fails if the
   migrations don't build exactly the schema, or if a migration has no `down`
   (unless it's listed as irreversible in `__tests__/server/migrations.test.ts`).

A migration that can't be undone safely (for example, one that drops data)
can leave `down` out and be listed as irreversible. Rolling it back then fails
instead of pretending it worked.

Migrations run in a deploy step (`npm run db:migrate`), never at app start-up.

## Running and rolling back migrations

```bash
npm run db:migrate                          # apply every pending migration
npm run db:status                           # list migrations and when each was applied
npm run db:rollback                         # undo the last applied migration
npm run db:rollback -- --to 0001_something  # undo every migration after 0001_something
```

How it works (`scripts/db/migrator.ts`):
- Migrations are the files in `database/migrations`, run in name order.
- Each applied migration is recorded by name in `kysely.kysely_migration`. The
  `kysely` schema keeps this out of `public`, so Supabase's API doesn't expose it.
- Everything pending runs in one transaction under a lock, so a failed
  migration leaves nothing half-applied and two deploys can't migrate at once.
- If an applied migration's file is missing, or a new one sorts
  before the last applied one (for example, a branch that merged late with an
  older number), the migrator stops with a "corrupted migrations" error
  instead of skipping it. Renumber the late migration and try again.
- A migration without `down` can't be rolled back: `db:rollback` fails
  and changes nothing. The baseline is like this on purpose.

**Production:** a rollback only undoes the schema. Vercel Instant Rollback
restores old code but not the old schema, so keep schema changes compatible
with the previous release (add first, remove in a later release), and read a
migration's `down` before running it on production: one that drops a column
drops its data.

**Switching branches locally:** roll back the branch's migrations before you
switch away (`npm run db:rollback -- --to <last migration on main>`), because the
branch's migrations (and their `down`) stay on that branch. If you forget, `db:migrate` stops with the
"missing migration" error; recreate the local database instead.

## Adopting the existing Supabase database (one time)

The production database already has these tables, so
`database/migrations/0000_baseline.ts` must be **recorded** there, not run:

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
   Both commands first compare the database with what the baseline migration
   builds (`scripts/db/schemaCheck.ts`). The baseline runs in a scratch schema
   inside a transaction that is rolled back, so nothing is left behind. The
   comparison covers every table, column (type, nullability, default or not),
   primary key, index, foreign key, check constraint and enum the baseline
   creates. On any difference they list it and stop without recording
   anything. Fix the baseline and `src/server/db/schema/index.ts`, and run it
   again. Tables the baseline doesn't create, views, row-level security and
   foreign keys into `auth` are not compared.
   Recording goes through Kysely's migrator, with the check in place of the
   baseline's `up`. So the check and the record happen in one transaction under
   the migrator's lock: nothing can change the schema or migrate in between, two
   runs at once record it once, and it writes the same row to
   `kysely.kysely_migration` that `db:migrate` would.
3. From then on, `npm run db:migrate` applies only newer migrations.
