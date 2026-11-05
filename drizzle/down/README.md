# Down migrations

`npm run db:rollback` runs `drizzle/down/<tag>.sql` to undo `drizzle/<tag>.sql`.
drizzle-kit doesn't write these; write one by hand for every new migration.

- Undo the up file's statements in reverse order.
- Separate statements with `--> statement-breakpoint`, like the generated files.
- A migration that can't be undone safely (for example, one that drops data)
  can leave its down file out. Rolling it back then fails instead of
  pretending it worked.

`0000_baseline` has no down file on purpose: undoing it would drop every table.
To start a local database over, recreate it (`npm run db:down`, delete the
volume, `npm run db:up`, `npm run db:migrate`).
