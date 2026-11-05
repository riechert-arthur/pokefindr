# Decision: database provider

**Status:** Decided · 2026-11-05 · answers open question 6 in `plans/postgres_orm_rearchitecture.md` and replaces its "suggested path" (§ provider) and phase 5

**Decision:** Use **Neon** for Postgres. Use Neon's copy-on-write **branches** as git-style environments: one branch for production, one for staging, and a short-lived one per preview deploy.

---

## 1. Why Neon

- Meets the requirements in `plans/postgres_orm_rearchitecture.md`: PostGIS, a pooled connection URL for serverless, a region next to Vercel's `iad1`, and point-in-time restore.
- **Branching:** a branch is a full copy of the schema and data, created in seconds without copying storage. This gives every environment a real database and lets us test migrations against production-shaped data before they reach production.
- **Vercel Marketplace integration:** sets `DATABASE_URL` / `DATABASE_URL_UNPOOLED` for each environment and can create a branch for every preview deployment.
- No code changes: the app only needs a connection string (`docs/database.md`). `getDb()` already sets `prepare: false`, which Neon's pooler (PgBouncer, transaction mode) needs.
- The Supabase project has stopped working: since 2026-11-05 its hostname no longer resolves, and production login fails because of it. So "stay on Supabase and move later" is no longer the cheaper option.

## 2. Branch layout

```
production   (Neon's default/root branch; the live data)
└── staging  (child of production; reset from production when needed)
    └── preview/<git-branch>   (one per Vercel preview deploy, deleted with it)
```

- **Production is the root branch, not a child.** Neon branches are cheap to reset or delete, and that's exactly what production must never be, so it stays the parent everything else comes from.
- **Staging** is a child of production. Before testing a risky migration, use "reset from parent" to bring it back in line with production. Each reset discards everything written to staging.
- **Previews** branch off staging (not production), so preview deploys don't get a direct copy of production user data. Vercel's Neon integration creates them and deletes them with the deployment.
- **Local development** stays on the docker PostGIS database (`npm run db:up`), and integration tests keep their own `pokefindr_test`. A personal Neon branch is fine for one-off debugging against real data.

| Environment | Neon branch | Vercel env vars |
|---|---|---|
| Production | `production` (root) | Production |
| Staging | `staging` | a custom `staging` environment, or Preview for the `staging` git branch |
| Preview | `preview/<git-branch>` | set per deployment by the integration |
| Local | (docker) | `.env.local` |

## 3. Migrations per branch

- A new branch inherits the parent's schema **and** its `kysely.kysely_migration` history, so `npm run db:migrate` on a branch only runs the migrations that branch's code adds.
- Run `db:migrate` against `DATABASE_URL_UNPOOLED` from one deploy step per environment (§7 of `plans/orm_migrations_decision.md` still applies).
- Promote changes the git way: migration merged → runs on staging → checked → runs on production. Never promote a Neon branch's data upward. Schema reaches production only through migrations.

## 4. Moving the data

**Decided: start fresh. No user data is carried over.** There were few sign-ups, and most visitors only use the map, which doesn't need an account.

- On an empty Neon production branch, `npm run db:migrate` builds the whole schema, the baseline included. The "Adopting the existing Supabase database" steps and `db:baseline` aren't needed.
- **Not migrated:** users, profiles and reviews from Supabase. Existing users sign up again.
- **Locations:** load them from `src/data/vending_machines_mod.json` (the backfill script from #65) or the ETL pipeline. Until the map reads from the database, it keeps using the bundled JSON, so it works with no data in Neon.
- **Auth:** Supabase Auth goes away with Supabase, so login stays broken until the auth migration (phase 4, Better Auth) lands. Starting fresh makes that migration simpler: no password hashes or OAuth identities to carry over. Foreign keys into `auth.users` won't exist on Neon.

## 5. Caveats

- **Scale-to-zero** adds a cold start of a few hundred milliseconds to the first query after the database has been idle. Turn it off on production if that shows up in response times.
- **Branch data includes personal data** (emails, profiles). Staging and previews hold a copy of production user data until a reset, so treat them with production-level access control.
- **Restore window:** point-in-time restore is limited to the plan's history retention period. Check it covers the backup expectation in `plans/orm_migrations_decision.md` §7, which this decision now makes Neon's restore rather than Supabase's.

## 6. Follow-ups

- [ ] Create the Neon project (region `us-east-1`, next to `iad1`) with `production` and `staging` branches. Enable PostGIS with `create extension postgis` (the baseline migration expects it).
- [ ] Connect the Vercel Marketplace integration and turn on per-preview branches (Preview deploys aren't running on Vercel today).
- [ ] Update `docs/database.md`: Neon URLs (pooled `-pooler` host for `DATABASE_URL`, direct host for `DATABASE_URL_UNPOOLED`) instead of the Supavisor ports.
- [ ] Load locations into the Neon production branch (§4).
- [ ] Move auth off Supabase (`plans/postgres_orm_rearchitecture.md` phase 4) before production depends on Neon.
