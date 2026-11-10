---
name: deploy-checklist
description: What PokeFindr needs before and after a staging or production deploy on Vercel + Neon - env vars per environment, migrations, crons, the firewall, canaries - and which steps must be done by a person. Use when someone asks how to deploy, set up staging, "what do I need to configure", which env vars to set, why a preview deploy fails at startup, or what manual steps a merged PR left.
---

# Deploying

PokeFindr runs on Vercel (Production and Preview environments) with Neon Postgres (a branch per environment). Settings per environment: `docs/auth.md`, "Settings per environment"; migrations: `docs/database.md`, "Deploying migrations".

## What happens automatically

- **On every push to `main`,** `.github/workflows/migrate.yml` applies pending migrations to **staging**, then to **production** if staging succeeded. Each GitHub environment holds its Neon branch's direct URL as `DATABASE_URL_UNPOOLED`. Migrations land before or around the code deploy, so keep them compatible with the code that's already running (see `schema-change`).
- **Vercel deploys** `main` to Production and other branches to Preview. Preview deployments sit behind Vercel login.
- **Crons** in `vercel.json` (`/api/jobs/*`) run only on Production and authenticate with `CRON_SECRET`.

## Env vars, per environment

The app refuses to start when a required variable is missing; `src/server/config.ts` is the source of truth. Typical set:

- **URLs:** `APP_URL` and `BETTER_AUTH_URL`, set per environment (staging's are not production's).
- **Secrets:** `BETTER_AUTH_SECRET`, `JWT_SECRET`, `CRON_SECRET`. Use different values for staging and production, marked sensitive.
  - Changing production's `BETTER_AUTH_SECRET` or `JWT_SECRET` signs everyone out, so don't rotate them as a side effect.
- **Mail:** `MAIL_PROVIDER`, `SMTP_URL`, `MAIL_FROM`.
- **Optional:** OAuth providers, the Anthropic key, geocoder settings, `RATE_LIMIT_STORE` (defaults to `postgres` in production).
- **Leftovers** from the Supabase and Mapbox days can be removed once nothing reads them.

Never print or decrypt existing values. Writing secrets into Vercel is the person's call: describe exactly what to add, and in which environment, unless they've given you permission to do it.

## Manual steps after merging

These don't happen on deploy. The PR that needs them should say so, and your report should list them.

- **Firewall:** `VERCEL_TOKEN=… npm run firewall` (dry run), then `npm run firewall -- --apply`, after `infra/vercel-firewall.json` changes.
- **Canaries:** `npm run canary:plant` against the environment's database, once per environment (`--list` shows them, `--remove` deletes them).
- **Location import:** `npm run db:import-locations` when the source data changes (`docs/database.md`, "Loading locations from the JSON").
- **Smoke test after deploy:**
  - `curl` to a bot-checked API (`/api/locations?bbox=…`) should get 403 on production;
  - the map should still load in a real browser;
  - sign-in and the emails it sends should work.
