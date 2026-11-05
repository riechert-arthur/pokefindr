# Decision: ORM and migrations

**Status:** Decided · 2026-11-04 · applies to `plans/postgres_orm_rearchitecture.md` §3 and PR #64 onward

**Decision:** Keep **Drizzle ORM** for the schema, queries and migrations. Migrations are **forward-only**. We don't roll back production migrations; we fix mistakes with a new migration, and backups are the emergency undo.

---

## 1. Why we revisited this

PR #64 adds Drizzle with `drizzle-kit` migrations. Coming from Rails, we wanted to know whether we'd have:

- migrations that run in a reliable order,
- a way to roll them back (`db:rollback`),
- good PostGIS support, since `locations.geog` is `geography(Point, 4326)`,
- a sane local workflow when switching between branches with different migrations.

Constraints: Next.js on Vercel (serverless), PostGIS, and PRs #65–#69 stacked on #64 already using Drizzle for queries (locations, reviews, users services, backfill script, health check, integration tests).

## 2. What Drizzle migrations do (checked in `drizzle-orm@0.45.4` source)

| | Drizzle | Rails |
|---|---|---|
| Order | Files listed in `drizzle/meta/_journal.json`, applied in order | Timestamped files |
| Atomic | All pending migrations run in **one transaction** | One per migration |
| Rollback / down migrations | **None.** No down files, no rollback command (`drizzle-kit drop` only deletes a file from the repo) | `down` / reversible `change`, `db:rollback` |
| What's tracked | Only the **newest timestamp**: a migration runs if it's newer than the last applied one | Every version |
| Edited migrations | Hash stored but never compared | Not detected either |
| Concurrent runs | No lock | Advisory lock |

The consequence of tracking only the newest timestamp: if two branches each add a migration and the **older one merges second**, it is **skipped silently**. Locally, the same happens after switching branches.

## 3. Options considered

### Kysely (query builder with a migrator)
- `up`/`down` migrations, `migrateDown()`, tracks each migration, takes a lock. Closest lightweight match to Rails migrations.
- No built-in PostGIS support: `sql` templates for functions; select `ST_X`/`ST_Y` or `ST_AsGeoJSON` instead of raw columns.
- Two ways to use it:
  - **Migrations only, Drizzle kept for queries:** small change, but the schema lives in two places (hand-written migrations and the Drizzle schema). Needs a CI check that the migrated database matches the Drizzle schema.
  - **Replace Drizzle entirely:** migrations become the source of truth and types are generated from the database (`kysely-codegen`), like `schema.rb`. Means rewriting #65, #66 and #68.

### TypeORM (checked in `typeorm@1.1.2` source)
- Actively maintained again: monthly releases since March 2025, **1.0 in May 2026**, 1.1.2 in October 2026.
- Strongest migrations of the options: `migration:generate` writes **both up and down**, `migration:revert` (one at a time), `migration:show`, `--fake` (would replace our baseline script), `migration:generate --check` for CI, tracks each migration by name (late merges still run), transaction mode `all`/`each`/`none`. No lock.
- Built-in `geography` and `geometry` columns (read and written as GeoJSON), spatial indexes.
- Downsides: heavy, decorators plus `reflect-metadata` (fiddly in Next.js and serverless), PostGIS and other queries are untyped strings, `migration:run` needs compiled `.js`. Would mean rewriting #65, #66 and #68.

### Prisma
- **Prisma 7 (stable): no PostGIS.** Columns are `Unsupported("geography(Point, 4326)")`, typed `any`, and a model with a required `Unsupported` field loses `create`/`update`, so every location write is raw SQL. Prisma pulled its draft PostGIS docs in May 2026 because support "is not currently available".
- **Prisma 8 (release candidate):** `@prisma/orm-extension-postgis` adds typed `Geometry` columns (GeoJSON) and seven query helpers (`distance`, `dwithin`, `within`, …). No `geography` type or index support mentioned. Still a release candidate.
- Rollback: no command. Down SQL can be generated with `migrate diff` and run by hand, but `migrate resolve --rolled-back` only applies to **failed** migrations. For a successful one, Prisma's docs say to write a new migration. Better than Drizzle on tracking: each migration tracked, checksums, advisory lock.

### MikroORM
- Generates up and down migrations from entities, with `migration:down`. Heavier (tracks loaded objects and saves changes in batches) and needs extra setup for Next.js bundling. Not evaluated in depth.

## 4. Query builder vs ORM

- A **query builder** (Kysely, and mostly Drizzle) maps each call to one visible SQL query: no lazy loading or N+1 surprises, full SQL (CTEs, `ON CONFLICT`, PostGIS), plain result objects, result types follow the query. Good fit for serverless.
- An **ORM** (TypeORM, MikroORM, ActiveRecord) gives models with associations, validations, callbacks and `record.save`. Less code, but SQL runs behind your back.
- Without models, the logic lives in **service functions**: zod for validation, joins written in each query, `CHECK` constraints in the database, and "callbacks" are just the next line (e.g. `revalidateTag` after an insert). Routes must write through the services. `src/server/services/reviews.ts` (#66) already works this way.
- Drizzle sits close to Kysely here, so the choice between them was mainly about migrations and where the schema lives, not query style.

## 5. PostGIS support

| | `geography` column | Spatial queries | Migrations with PostGIS | GiST index |
|---|---|---|---|---|
| **Drizzle 0.45** | custom `geographyPoint` type (`src/server/db/geography.ts`); built-in type is `geometry` point only | typed `sql` templates | generated, but `drizzle-kit` quotes `geography` and needs a hand edit | `index().using("gist", …)` |
| **Kysely** | none; select `ST_X`/`ST_Y` | typed `sql` templates | hand-written | in the migration |
| **TypeORM 1.x** | built in (GeoJSON) | untyped strings | generated | `@Index({ spatial: true })` |
| **Prisma 7** | `Unsupported` (`any`, raw SQL only) | raw SQL | partly hand-edited | unclear |
| **Prisma 8 RC** | not mentioned (`Geometry` only) | 7 helpers | handled by the extension | not mentioned |

Every option needs raw PostGIS SQL for the queries this app runs, so PostGIS ruled out Prisma 7 but didn't decide between the others. Drizzle 1.0's release candidate lists `geography` types internally, so native support may come.

## 6. Why Drizzle

- Already working in #64–#69, including the `geography` custom type and integration tests against real PostGIS.
- Typed queries, including PostGIS calls through `sql` templates; light enough for serverless.
- The missing rollback matters less than it looks:
  - In **production**, rolling back a migration usually loses data, and Vercel Instant Rollback restores old code but not the old schema. So old code must work with the new schema anyway. Two-step schema changes plus forward fixes are the safer habit in any tool.
  - **Locally**, even down migrations don't help when switching branches: the down file lives on the branch you're leaving. Teams reset the dev database instead.
- Switching would have cost a rewrite of #65, #66 and #68 for a feature (rollback) we'd rarely use in production.

## 7. How we work with it

- **Forward-only migrations, two-step schema changes:** first add the new column or table so old and new code both work; ship the code that uses it; remove the old thing in a later migration. If a migration is wrong, fix it with a new one.
- **Backups:** Supabase point-in-time recovery (or the future provider's equivalent) is the undo for a bad production migration.
- **Run migrations from one deploy step only** (no lock).
- **Local branch switching:** `npm run db:reset` (drop, migrate, seed) after switching to a branch with different migrations. Integration tests already create and migrate a fresh `pokefindr_test` database on each run, so they're unaffected. Per-branch databases (`CREATE DATABASE … TEMPLATE …`) only if resets get slow.

## 8. Follow-ups

- [ ] **CI ordering check:** fail if a new migration's timestamp isn't later than every migration on `main`, or if an already-merged migration file changed. Closes the "skipped silently" and "edited migration" gaps.
- [ ] **`npm run db:reset` and a seed script** (the backfill script from #65 could supply locations).
- [ ] Optional: hand-written `drizzle/down/*.sql` with a `db:rollback` script for local use only, tested up → down → up in CI.

## 9. When to revisit

- Drizzle ships a native `geography` column (watch Drizzle 1.0).
- Prisma 8 and its PostGIS extension reach a stable release with `geography` support.
- We find we need production rollbacks often, which would point to TypeORM or Kysely migrations.

## Sources

- Source code: `drizzle-orm@0.45.4` (`pg-core/dialect.js`, `migrate()`), `drizzle-orm@1.0.0-rc.5`, `typeorm@1.1.2` (`migration/MigrationExecutor.js` and CLI commands); npm release history for `typeorm`, `prisma`, `@prisma/orm-extension-postgis`, `drizzle-orm`.
- [Drizzle docs: PostgreSQL extensions (PostGIS)](https://orm.drizzle.team/docs/extensions/pg)
- [TypeORM docs: executing migrations](https://typeorm.io/docs/migrations/executing)
- [Prisma docs: generating down migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/generating-down-migrations)
- [Prisma docs: SafeQL & Prisma Client (PostGIS via `Unsupported`)](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/safeql)
- [Prisma PostGIS extension listing](https://www.prisma.io/extensions/postgis)
- [prisma/web PR #7909: PostGIS docs reverted](https://github.com/prisma/web/pull/7909)
