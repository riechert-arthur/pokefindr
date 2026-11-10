---
name: schema-change
description: Change the PokeFindr database schema the right way - edit the Drizzle schema, write a Kysely migration with up and down, check for drift, and test it. Use whenever a task adds or changes a table, column, index, enum or constraint, touches database/migrations or src/server/db/schema, or a db:check / "doesn't match src/server/db/schema" error comes up.
---

# Changing the schema

Two things describe the database, and they must agree:

- `src/server/db/schema/index.ts`: the Drizzle schema the app queries through.
- `database/migrations/NNNN_description.ts`: Kysely migrations, which are what actually change databases. They run in name order and are recorded by name in `kysely.kysely_migration`, with a hash of each file in `kysely.kysely_migration_hash`.

`npm run db:check` compares the two and prints the SQL drizzle-kit would run when they differ. Full guide: `docs/database.md`, "Changing the schema".

## Steps

1. Edit the Drizzle schema.
2. Add the next migration, numbered after the last file in `database/migrations/`:
   ```ts
   import type { Kysely } from "kysely"

   export async function up(db: Kysely<unknown>): Promise<void> {
     await db.schema.alterTable("profiles").addColumn("nickname", "text").execute()
   }

   export async function down(db: Kysely<unknown>): Promise<void> {
     await db.schema.alterTable("profiles").dropColumn("nickname").execute()
   }
   ```
   - Write a `down()`. The integration tests run every migration up, down and up again.
   - When existing rows need new values, backfill them in `up()`.
   - Use `sql\`…\`` from kysely for anything the schema builder can't express, such as PostGIS, check constraints or partial indexes.
3. Apply it and check it: `make run`, which runs `branchDatabase` → `db:migrate` → `db:check` → seed, or `npm run db:migrate && npm run db:check` from the host.
4. Test it: `npm run test:integration` (see `verify-changes`). `__tests__/integration/migrations.test.ts` already checks the round trip and drift for every migration. Add a test there when a migration moves data.

## Rules and why

- **Never edit a migration that's on `main`.** Merging to `main` makes the `migrate` workflow apply it to staging and then production, so it has already run there and won't run again. Write a new migration instead. Editing a migration in an open PR is fine: local branch databases notice the edit and rebuild themselves.
- **A new migration must sort after every applied one.** Kysely refuses one that sorts earlier. If `main` gained a migration with your number while your PR was open, renumber yours.
- **Keep migrations safe on a live table:** add columns as nullable or with a default, and don't drop or rename something the deployed code still reads; do that in a later PR. The old code keeps running until the new deploy is live. Migrations run in one transaction, so `CREATE INDEX CONCURRENTLY` isn't available.
- **Keep Kysely bookkeeping in the `kysely` schema,** never `public`, so it isn't exposed.

## When `make run` fails on db:check

- **"Nothing to apply" then drift:** the branch's database ran an older version of a migration. Branch databases rebuild themselves when a migration's hash changes, but databases from before hashes existed can't be checked. Run `make fresh`, which drops only this branch's database and rebuilds it.
- **Drift with a migration pending:** the schema and migration really disagree. Fix whichever is wrong.
- **"corrupted migrations":** an applied migration is missing, or a new one sorts before an applied one. Renumber.
