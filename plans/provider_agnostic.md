# Plan: Provider-Agnostic Architecture

**Goal:** Any outside service PokeFindr depends on (database, auth, email, hosting, maps, geocoding, analytics, scheduled jobs) can be replaced by changing config and one adapter, without touching business logic or UI.

**Status:** Proposal · 2026-11-01 · builds on `plans/postgres_orm_rearchitecture.md`, which covers the database and ORM move in detail. This plan doesn't repeat it.

**Done when:** `docker compose up` starts the full app (map, sign-up, login, email confirmation, reviews) with **no third-party accounts**, and the production Vercel deploy differs only in environment variables.

---

## 1. Current provider dependencies

| Capability | Provider today | How it's coupled | Where |
|---|---|---|---|
| Database | Supabase Postgres | `@supabase/supabase-js` query builder, RPCs, RLS, generated types | `src/lib/supabase/db.ts`, every `api/**` route |
| Identity (users, passwords, OAuth, email confirm) | Supabase Auth | `auth.signUp`, `signInWithPassword`, `verifyOtp`, `signInWithOAuth`, `auth.admin.*` | `src/lib/supabase/auth.ts`, `api/auth/*`, `api/user-settings` |
| Sessions | **Self-owned** | JWT in `app_session` cookie, `JWT_SECRET` | `src/middleware.ts`, `api/auth/{login,callback,onboarding,logout}` |
| Transactional email | Supabase (sent implicitly by Supabase Auth) | Not visible in code; configured in the Supabase dashboard | (none) |
| Hosting / compute | Vercel | Implicit. No `vercel.json`, no standalone build, and the `Dockerfile` is a dev shell, not an app image | `next.config.ts`, `Dockerfile` |
| Caching / revalidation | Vercel (Next.js data cache) | Not used yet. The ORM plan adds `revalidateTag` | (none) |
| Scheduled jobs | GitHub Actions (weekly) | Cron in the workflow file | `.github/workflows/weekly-update.yml` |
| Map rendering + tiles | Mapbox GL JS | `mapbox-gl` v3 (proprietary licence, token required), `mapbox://styles/mapbox/streets-v12`, `NEXT_PUBLIC_MAPBOXGL_API_KEY` | `MapInstance.tsx`, `PokemonCenterLocationPins.tsx` |
| Geocoding (search bar) | Mapbox Geocoding | Called **from the browser** with a public key | `MapSearchBar.tsx:48,108` |
| Analytics | Vercel Analytics | `@vercel/analytics` in the root layout | `src/app/layout.tsx:3` |
| Affiliate tracking | Hard-coded env vars | `NEXT_PUBLIC_*_1` | `AffiliateBanner.tsx` |
| CI | GitHub Actions | Fine. Not a runtime dependency | `.github/workflows/` |

Configuration is read with scattered `process.env.X!` calls (12+ places), and nothing checks it at startup. A missing variable shows up as a runtime error on whichever request needs it first.

---

## 2. Principles

1. **Rely on open standards first, and write custom interfaces only where none exists.** Postgres wire protocol + SQL, SMTP, OAuth 2 / OIDC, OCI containers, OpenTelemetry, and the MapLibre style spec are already open interfaces. Don't wrap Postgres in a `DatabaseProvider` interface: Drizzle over `DATABASE_URL` is the abstraction.
2. **Ports and adapters only where a real swap is likely.** A port is a small TypeScript interface in `src/server/ports/`. Adapters live in `src/server/adapters/<capability>/<vendor>.ts`. One factory picks the adapter from config.
3. **Vendor SDKs appear only in adapter files.** Enforce this with ESLint `no-restricted-imports`: `@supabase/*`, `@vercel/*`, `mapbox-gl`, `resend`, and so on are allowed only under `src/server/adapters/**` (plus a single client-side map adapter, §6).
4. **One validated config module.** Every environment variable is read once, parsed with zod, and the app fails at boot if one is missing.
5. **Every port has a local or no-op adapter.** Console mailer, in-memory cache, fake geocoder, no-op analytics. This makes local dev, CI, and self-hosting work with no accounts.
6. **Our data stays in our database.** Users, sessions, and OAuth links live in tables we own (via the auth library), never only inside a provider.

---

## 3. Target layout

```
src/
  server/
    config.ts                 # zod-parsed env; the only process.env reader
    db/                       # Drizzle schema, client, queries (see ORM plan)
    ports/
      mailer.ts               # send(templateId, to, data)
      geocoder.ts             # search(query, { proximity, bbox, limit })
      cache.ts                # invalidate(tags[])
      jobs.ts                 # registry of named jobs + run(name)
      analytics.ts            # server-side track(event, props)  (optional)
    adapters/
      mailer/      smtp.ts  resend.ts  ses.ts  console.ts
      geocoder/    mapbox.ts  maptiler.ts  nominatim.ts  fake.ts
      cache/       next.ts  noop.ts
      analytics/   vercel.ts  plausible.ts  noop.ts
    services/                 # business logic; depends on ports, never adapters
    auth/                     # Better Auth instance (library, not a provider)
    container.ts              # builds adapters from config once; exported singletons
  components/
    map/
      engine.ts               # the only file that imports the map library
```

Example port and factory:

```ts
// src/server/ports/mailer.ts
export interface Mailer {
  send(msg: { to: string; subject: string; html: string; text: string }): Promise<void>
}

// src/server/container.ts
import { config } from './config'
export const mailer: Mailer =
  config.MAIL_PROVIDER === 'smtp'    ? new SmtpMailer(config.SMTP_URL) :
  config.MAIL_PROVIDER === 'resend'  ? new ResendMailer(config.RESEND_API_KEY) :
                                       new ConsoleMailer()
```

Config module (abbreviated):

```ts
// src/server/config.ts
const schema = z.object({
  APP_URL:            z.string().url(),
  DATABASE_URL:       z.string().url(),
  SESSION_SECRET:     z.string().min(32),            // replaces JWT_SECRET
  MAIL_PROVIDER:      z.enum(['console', 'smtp', 'resend', 'ses']).default('console'),
  SMTP_URL:           z.string().optional(),
  GEOCODER_PROVIDER:  z.enum(['fake', 'mapbox', 'maptiler', 'nominatim']).default('fake'),
  GEOCODER_API_KEY:   z.string().optional(),
  ANALYTICS_PROVIDER: z.enum(['none', 'vercel', 'plausible']).default('none'),
  CRON_SECRET:        z.string().min(32),
}).superRefine(requireKeysForSelectedProviders)
export const config = schema.parse(process.env)
```

Public (browser) settings go in a separate `src/config.public.ts` that reads only `NEXT_PUBLIC_*` (map style URL, analytics provider name), so server secrets can't leak into the client bundle.

---

## 4. Per capability

### 4.1 Database (Postgres)

Covered by the ORM plan. What matters for provider independence:
- The app depends on **Postgres 15+ with PostGIS** through `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (migrations). Nothing else.
- No RLS, no provider RPCs, no provider client. Authorization lives in services.
- Avoid provider-only extensions (Supabase `pg_net`, `pgsodium`, Neon `neon_*`). Allowed: `postgis`, `pgcrypto`, `citext`, `pg_trgm`.
- **Vercel's connection helper:** `@vercel/functions`' `attachDatabasePool` is not used: it doesn't support postgres-js (it throws "Unsupported database pool type"). postgres-js's `idle_timeout` closes idle connections on any host.
- Migrations run with `npm run db:migrate` (Kysely's migrator) against any Postgres. CI proves this by running them against a vanilla `postgis/postgis` container.

### 4.2 Identity and sessions

Use **Better Auth** (a library inside our app, not a hosted provider), storing `users`, `accounts`, `sessions`, and `verifications` in our Postgres via its Drizzle adapter.
- Email/password with bcrypt verification, so hashes migrated from Supabase still work (see ORM plan §7).
- OAuth through standard OAuth2/OIDC provider configs (Google, Discord, and others). Adding or removing one is config only.
- Email verification and password reset call the `Mailer` port, which removes the hidden dependency on Supabase-sent email.
- Sessions: keep the current pattern (httpOnly cookie, verified in middleware with no DB call). Either keep issuing the `app_session` JWT after Better Auth login, or use Better Auth's signed cookie cache. Both work without a provider.
- Removes: `src/lib/supabase/auth.ts`, the `adminDB` login side-effect, and the hard-coded `emailRedirectTo: "http://localhost:3000/login"` (now built from `config.APP_URL`).

### 4.3 Transactional email

- Port: `Mailer`. Templates live in our repo (React Email or plain TSX → HTML + text), not in a provider dashboard.
- Adapters:
  - `smtp`: works with almost any provider (SES, Postmark, Resend, Mailgun, and Mailpit locally).
  - `console`: logs to stdout in dev and CI.
  - Native API adapters (`resend`, `ses`) are optional, only if SMTP limits become a problem.
- Local: Mailpit in `docker-compose.yml` catches every message at `localhost:8025`.

### 4.4 Hosting and compute

Make the app run unchanged on Vercel, in a container (Fly, Railway, Render, Cloud Run, ECS, a VPS), or on Node directly.
- `next.config.ts`: `output: 'standalone'`.
- Replace the dev `Dockerfile` with a multi-stage production image: `node:22-alpine` deps → build → `standalone` runner, non-root, `HEALTHCHECK` on `/api/health`. Keep the current Arch dev shell as `Dockerfile.dev` if it's still used (`make shell` depends on it).
- Add `GET /api/health`, which checks the DB with `select 1`.
- Middleware stays Edge-compatible (it already is: `jose` + cookie only), and also runs on self-hosted Node.
- `next/image`: add `sharp` as a dependency so image optimization works outside Vercel.
- **Avoid:** Vercel-only features in app code (`@vercel/kv`, `@vercel/blob`, Edge Config, `vercel.json` rewrites). If one is needed, it goes behind a port.

### 4.5 Caching and revalidation

- Port: `cache.invalidate(tags)`. Services call it after writes (new review → `['locations', 'location:{id}:reviews']`).
- `next` adapter: `revalidateTag`. This works on Vercel automatically. Self-hosted with **one instance**, the default file cache is fine. Self-hosted with **several instances** needs a shared Next.js `cacheHandler` (Redis/Valkey, via `@neshca/cache-handler` or the built-in custom handler API) configured in `next.config.ts` from env. No app code changes.
- Point data also gets a CDN-friendly `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`, which any CDN (Vercel, Cloudflare, CloudFront) respects.

### 4.6 Scheduled and background jobs

- Jobs are **plain HTTP endpoints** under `/api/jobs/<name>`, protected by `Authorization: Bearer ${CRON_SECRET}` and registered in `ports/jobs.ts`.
- Any scheduler can call them: `vercel.json` crons, GitHub Actions `schedule`, Kubernetes CronJob, systemd timer, Cloud Scheduler. The scheduler config is deployment-specific. The job code isn't.
- Long jobs follow the chunked, resumable pattern from `plans/location_etl_async_pipeline.md` (task table in Postgres + `SKIP LOCKED`), which avoids any vendor queue.
- A CLI wrapper (`npm run job <name>`) runs the same job function without HTTP, for local runs and containers.

### 4.7 Map rendering and tiles

The most locked-in part of the frontend. Mapbox GL JS v2+ is proprietary and only works with a Mapbox token.
- **Switch to MapLibre GL JS** (open-source fork, same API). `react-map-gl` v7 supports it with `import Map from 'react-map-gl/maplibre'`, so the component code barely changes.
- Map style becomes a **URL from config** (`NEXT_PUBLIC_MAP_STYLE_URL`) in the open MapLibre style spec. Swappable tile providers: MapTiler, Stadia Maps, Protomaps (self-hosted PMTiles file on any object store/CDN, with no API key), or still Mapbox (a Mapbox style works in MapLibre with a transform for `mapbox://` URLs).
- `components/map/engine.ts` is the only module importing the map library. Replace the `MapboxGeoJSONFeature`/`MapLayerMouseEvent` type imports in `PokemonCenterLocationPins.tsx` with types re-exported from there.
- Font glyphs: the cluster layer uses `"DIN Offc Pro Medium", "Arial Unicode MS Bold"`, which are Mapbox-hosted fonts. Switch to fonts the chosen style serves (for example `Noto Sans Regular`), set from config with the style.

### 4.8 Geocoding (search bar)

- Move geocoding **server-side**: `GET /api/geocode?q=…&near=lng,lat` → `geocoder.search()` → a common result shape `{ label, lng, lat, bbox? }`.
  - The API key is no longer in the browser (`NEXT_PUBLIC_MAPBOX_GEOCODING_API_KEY` is removed).
  - Providers can be swapped without a client deploy.
  - Results can be cached and rate-limited in one place.
- Adapters: `mapbox`, `maptiler`, `nominatim` (OSM; respect its usage policy, or self-host), `fake` (fixed fixtures for tests).
- `MapSearchBar.tsx` calls `/api/geocode` and keeps its local fuse.js search over machine names.

### 4.9 Analytics and observability

- **Client analytics:** an `<Analytics />` wrapper in `components/` that renders `@vercel/analytics`, a Plausible/Umami script, or nothing, based on `NEXT_PUBLIC_ANALYTICS_PROVIDER`.
- **Server telemetry:** Next.js `instrumentation.ts` with OpenTelemetry (`@vercel/otel` works on any host, or the plain OTel SDK). Export over OTLP so any backend (Grafana, Honeycomb, Datadog, Vercel) receives it.
- **Logging:** structured JSON to stdout (`pino`). Every platform collects stdout. Remove the stray `console.log` calls in routes that print coordinates.

### 4.10 Affiliate banner

Not a provider dependency in the same sense, but it currently uses numbered env vars. Move banners to a `banners` table, or a typed config array, so adding one doesn't need new `NEXT_PUBLIC_*_N` variables and a rebuild. Low priority.

---

## 5. Local, self-hosted reference stack

`docker-compose.yml` is the proof that the app is provider-agnostic:

```yaml
services:
  db:       { image: postgis/postgis:16-3.4, environment: { POSTGRES_PASSWORD: dev }, ports: ["5432:5432"] }
  mail:     { image: axllent/mailpit, ports: ["8025:8025", "1025:1025"] }
  app:
    build: .
    environment:
      APP_URL: http://localhost:3000
      DATABASE_URL: postgres://postgres:dev@db:5432/postgres
      SESSION_SECRET: dev-secret-at-least-32-characters-long
      CRON_SECRET: dev-cron-secret-at-least-32-characters
      MAIL_PROVIDER: smtp
      SMTP_URL: smtp://mail:1025
      GEOCODER_PROVIDER: fake
      NEXT_PUBLIC_MAP_STYLE_URL: https://demotiles.maplibre.org/style.json
    ports: ["3000:3000"]
    depends_on: [db, mail]
```

`npm run db:seed` loads a fixture set of locations (a few hundred, committed) so the map isn't empty.

---

## 6. Enforcement

- **ESLint** `no-restricted-imports`:
  - vendor packages (`@supabase/*`, `@vercel/*` except inside `adapters/` and `db/client.ts`, `mapbox-gl`, `maplibre-gl` except `components/map/engine.ts`, email SDKs);
  - `process.env` outside `config.ts` / `config.public.ts` (via `no-restricted-properties`);
  - `src/server/**` from client components.
- **Contract tests per port:** one shared test suite (for example `mailerContract(makeMailer)`), run against each adapter. External adapters run only when their credentials are present. The local adapters always run.
- **CI "no-vendor" job:** builds the production Docker image and runs it against `postgis` + Mailpit with only local adapters. Then it runs Playwright smoke tests (load map, sign up, confirm via Mailpit API, log in, post a review). If this passes, no hidden provider dependency has crept in.

---

## 7. Rollout

| Phase | Work | Depends on |
|---|---|---|
| **0. Config + quick fixes** | `config.ts` / `config.public.ts`, move every `process.env` read into them. Fix the localhost `emailRedirectTo` and the shared-`adminDB` login side-effect now (cheap, and they're bugs today) | (none) |
| **1. Database** | ORM plan phases 1–3 (Drizzle, points from DB, reviews by ID) | 0 |
| **2. Hosting portability** | `output: 'standalone'`, production `Dockerfile`, `/api/health`, `docker-compose.yml`, `sharp`, CI "no-vendor" job (map + reviews only at first) | 1 |
| **3. Identity + email** | Better Auth, `Mailer` port + SMTP/console adapters, templates in repo, user and hash migration. Extend the no-vendor job to sign-up/login | 1, 2 |
| **4. Maps + geocoding** | MapLibre + configurable style URL, `engine.ts`, `/api/geocode` + `Geocoder` port, remove public geocoding key | 0 |
| **5. Jobs, cache, telemetry** | `/api/jobs/*` + `CRON_SECRET`, `cache` port, OTel `instrumentation.ts`, analytics wrapper, pino | 1 |
| **6. Lint lock-in + rehearsal** | Turn on the import restrictions as errors. Rehearse a swap: deploy one preview to a container host against a non-Supabase Postgres and confirm it works | all |

Phase 4 is independent of 1–3 and can run in parallel.

---

## 8. What stays provider-specific

Some things should stay tied to a provider:
- **Deployment config** (`vercel.json`, `fly.toml`, workflow files). This is per environment by nature. Keep it thin and out of `src/`.
- **Map tiles.** Someone has to serve them. The style URL makes the provider swappable, but there will always be one, unless you self-host PMTiles, which shifts the cost to storage and bandwidth.
- **OAuth identity providers** (Google, Discord). These are the users' own accounts. Standard OIDC keeps them interchangeable.

---

## 9. Open questions

1. **Map tiles:** which provider after leaving Mapbox (MapTiler / Stadia / self-hosted Protomaps)? Or keep Mapbox tiles through MapLibre for now?
2. **Email:** which SMTP provider for production, and what sender domain? This needs DNS (SPF/DKIM).
3. **Hosting:** is leaving Vercel a real possibility, or only a hedge? That decides how much of phase 2 (multi-instance cache handler, container CI) to build now versus document.
4. **Analytics:** keep Vercel Analytics, or switch to a self-hostable one (Plausible/Umami) now?
