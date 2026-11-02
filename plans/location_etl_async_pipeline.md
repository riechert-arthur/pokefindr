# Plan: Asynchronous Location ETL Pipeline

**Goal:** Keep the map's vending-machine points correct (new machines added, moved machines updated, removed machines hidden) on a regular schedule, without manual work, while the app is deployed on Vercel.

**Status:** Proposal · 2026-11-01 · branch `feat/location_etl_pipeline`

---

## 1. Where things stand today

### How the map gets its points

The map does **not** read from the database. It reads a JSON file that is built into the app:

- `src/components/map/MapInstance.tsx:12` and `src/components/map/LocationInfoPanel.tsx:27` both `import machineData from "@/data/vending_machines_mod.json"` (~4 MB, 1,457 features).
- `LocationInfoPanel` finds a machine by `machineData.features[info.feature_index]`. That index only means something inside this one bundled file.
- Reviews are linked to `public.locations` by distance: `get_location_by_point(lat, lng, 50m)` (`src/app/api/get-reviews/route.ts`).

So today the map only changes when the JSON is committed and Vercel rebuilds. The weekly GitHub Action (`.github/workflows/weekly-update.yml`) does exactly that: scrape → write JSON → commit → push (which triggers a Vercel deploy) → upsert into Supabase.

### The new ETL script

`scripts/location_etl_pipeline/scrape_vending_api_by_zip.py`:

- Sweeps `api.vending.prod.pokemon.com/v1/machines` by bounding box. It starts from a ~4°×4° grid over the continental US (~105 seed boxes) and splits a box into quarters when the response hits the cap (20 results), up to depth 8.
- Waits 1 s between requests and retries 403/429/5xx with 10 s, 20 s, 30 s, 40 s backoff.
- Drops machines whose `machineID` is already in `locations`, then **clears** `locations_staging` and upserts the rest.

### Gaps that matter for "correct points"

| # | Gap | Effect |
|---|-----|--------|
| G1 | Map points are bundled at build time | Database updates never show up on the map until a redeploy. |
| G2 | Staging only gets machines that are *not* in `locations` yet | Moved machines and removed machines can't be detected. Only additions get through. |
| G3 | Nothing moves rows from `locations_staging` to `locations` | Staging is a dead end right now. |
| G4 | A full sweep takes a long time (hundreds to thousands of requests at ≥1 s each, plus backoff) | Won't finish inside one Vercel function call (see §2). |
| G5 | Partial sweeps look the same as complete ones | A sweep that got rate-limited halfway would look like "half the machines were removed". |
| G6 | `feature_index` is a position in the array | Any change to the dataset can point the info panel at the wrong machine. |
| G7 | `scripts/requirements.txt` (uncommitted change) drops `cloudscraper`, `beautifulsoup4`, `python-dotenv` | `scripts/scrape_and_merge.py` imports all three, so the current weekly workflow will fail once this is merged. |
| G8 | `database.types.ts` shows `locations` without `machineID`, but `push_supabase.py` upserts `on_conflict=machineID` | The generated types are stale. Regenerate them before writing TypeScript against `locations`. |

---

## 2. Vercel constraints

Check these numbers against the current Vercel docs before building. They change often.

- **Function duration:** with Fluid Compute, the maximum is about 300 s on Hobby and about 800 s on Pro. A full sweep doesn't fit, so the work has to be split into chunks and resumable.
- **Cron:** Vercel Cron calls a route on a schedule. On Hobby it runs at most once a day (with loose timing). On Pro it can run every minute.
- **Statelessness:** functions can't keep state between calls. Progress has to live somewhere durable, which here means Supabase.
- **Outbound IPs:** Vercel and GitHub Actions both run from shared cloud IP ranges. The Pokémon endpoint already returns 403s sometimes (the script treats 403 as retryable), so either platform could get blocked. The design must fail safe (§4.4).
- **Build-time data:** anything imported from `src/data` is frozen at deploy time. To update without redeploying, the map has to fetch points at runtime and use cache tags with on-demand revalidation.

---

## 3. Recommended architecture

Supabase is the source of truth. Ingestion runs as a **job queue** of small, resumable tasks. The map reads a **cached runtime endpoint**, and that cache is cleared when a run is promoted.

```
          ┌────────────────────────── trigger ──────────────────────────┐
          │  Vercel Cron (daily)  ─or─  GitHub Actions schedule/dispatch │
          └───────────────┬─────────────────────────────────────────────┘
                          ▼
  [1] POST /api/etl/start ─────► etl_runs (status=sweeping)
                                 etl_tasks (one row per grid seed, status=pending)
                          │
                          ▼
  [2] POST /api/etl/work  ◄──┐  claims N tasks (FOR UPDATE SKIP LOCKED)
        fetch bbox from API  │  capped → insert 4 child tasks
        write machines into  │  ok     → upsert into locations_staging (run_id)
        locations_staging    │  error  → attempts++, backoff, or failed
        stops at ~80% of max │
        duration, then calls ┘  itself again (or the next cron tick picks up)
                          │
                          ▼ (no pending tasks left)
  [3] finalize: SQL function promote_locations_run(run_id)
        • sanity checks (coverage, removal %, count change)
        • INSERT new / UPDATE moved / mark missing as unseen
        • status=promoted  ─or─  status=held_for_review
                          │
                          ▼
  [4] revalidateTag('locations')  ──►  GET /api/locations (GeoJSON, cached)
                                          ▲
                              MapInstance fetches at runtime
```

### Why this shape

- **Chunked tasks** fix G4. Each call to `/api/etl/work` does a bounded amount of work (for example 60–120 boxes, or until ~240 s), so it stays under any plan's limit.
- **The queue in Postgres** gives us retries, resumability, and exactly-once claiming (`SKIP LOCKED`) with no new infrastructure.
- **Full snapshot in staging, keyed by `run_id`** fixes G2 and G5. Every run records every machine it saw, and promotion compares a *complete* run against `locations`.
- **SQL promotion** fixes G3. It runs in one transaction in the database, next to the data, with no timeout risk.
- **Runtime GeoJSON plus tag revalidation** fixes G1. New points appear within seconds of promotion, with no commit and no redeploy.

---

## 4. Components in detail

### 4.1 Database (new migration)

```sql
-- Run bookkeeping
create table public.etl_runs (
  id            uuid primary key default gen_random_uuid(),
  source        text not null default 'pokemon_vending_api',
  status        text not null default 'sweeping'
                check (status in ('sweeping','finalizing','promoted','held_for_review','failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  stats         jsonb not null default '{}'::jsonb,  -- requests, splits, capped, failures, diff counts
  error         text
);

-- One row per bounding box to fetch
create table public.etl_tasks (
  id            bigserial primary key,
  run_id        uuid not null references public.etl_runs(id) on delete cascade,
  sw_lat double precision not null, sw_lng double precision not null,
  ne_lat double precision not null, ne_lng double precision not null,
  depth         int  not null default 0,
  status        text not null default 'pending'
                check (status in ('pending','running','done','capped_leaf','failed')),
  attempts      int  not null default 0,
  not_before    timestamptz not null default now(),   -- backoff
  locked_at     timestamptz,
  result_count  int,
  last_error    text
);
create index on public.etl_tasks (run_id, status, not_before);

-- Staging becomes a per-run snapshot (replaces "clear then upsert")
alter table public.locations_staging
  add column run_id uuid references public.etl_runs(id) on delete cascade,
  add column raw jsonb;                                 -- original API payload, for debugging
-- unique per run, not globally:
--   unique (run_id, "machineID")

-- Lifecycle on the live table
alter table public.locations
  add column last_seen_at   timestamptz,
  add column missed_runs    int not null default 0,
  add column is_active      boolean not null default true,
  add column manual_override boolean not null default false;  -- replaces _manual_override in JSON
```

Task claiming, run atomically from the worker through an RPC:

```sql
create function public.etl_claim_tasks(p_run uuid, p_limit int)
returns setof public.etl_tasks language sql as $$
  update public.etl_tasks t set status = 'running', locked_at = now(), attempts = attempts + 1
  where t.id in (
    select id from public.etl_tasks
    where run_id = p_run
      and (status = 'pending' or (status = 'running' and locked_at < now() - interval '10 minutes'))
      and not_before <= now()
    order by depth desc, id           -- go deep first so the queue stays small
    limit p_limit
    for update skip locked)
  returning t.*;
$$;
```

The `locked_at < now() - 10 min` clause recovers tasks left behind when a worker was killed mid-chunk.

### 4.2 Worker (`/api/etl/work`)

Port the core of `fetch_machines_adaptive` to TypeScript in `src/lib/etl/` so it runs as a normal Next.js route handler on Vercel. The logic is small: build the bbox request, check for the cap, split into four, map the record.

- **Auth:** require `Authorization: Bearer ${CRON_SECRET}`. Vercel Cron sends this header automatically when `CRON_SECRET` is set.
- **Budget:** `export const maxDuration = 300`. Loop "claim batch → process" until `Date.now() - start > 0.8 * maxDuration` or the queue is empty.
- **Per task:**
  - Request ok, fewer than `ENDPOINT_LIMIT` results: upsert into `locations_staging (run_id, machineID, …)`. Mark the task `done`.
  - Request ok, `>= ENDPOINT_LIMIT` results, can still split: insert four child tasks at `depth+1`. Mark the task `done`.
  - Request ok but can't split further: save the results and mark the task `capped_leaf` (counts against coverage).
  - 403/429/5xx: set `status='pending'` and `not_before = now() + backoff(attempts)`. After `MAX_ATTEMPTS`, mark it `failed`.
- **Politeness:** use one request at a time, or very low concurrency (≤2), with a delay around 1 s, as the Python script does now. Rate limiting is the main risk, so this is not where to save time.
- **Chaining:** when the time budget runs out and tasks remain, the worker calls `fetch('/api/etl/work', …)` on itself without awaiting it, using `waitUntil` from `@vercel/functions` so the request goes out. A cron tick every 5–10 minutes (Pro) or a GitHub Actions loop (Hobby, §5) acts as a backup in case a chain breaks.
- **Finalize:** when a claim returns nothing and no tasks are `pending`/`running`, set the run to `finalizing`, call `rpc('promote_locations_run', { run_id })`, then `revalidateTag('locations')`.

### 4.3 Promotion (`promote_locations_run`, SQL, single transaction)

1. **Coverage gate (G5):** if any task is `failed`, or `capped_leaf` > threshold, mark the run `held_for_review` and stop. Additions may still be promoted (see "Policy" below), but **no deletions or moves** come from an incomplete run.
2. **Diff staging against `locations` on `machineID`:**
   - *New:* insert with `is_official=true`, `last_seen_at=now()`.
   - *Seen:* set `last_seen_at=now()`, `missed_runs=0`, `is_active=true`. If the location moved more than ~25 m and `manual_override=false`, update `geog`/`name`/`description`.
   - *Missing* (official, in `locations` but not in this run): `missed_runs += 1`. Set `is_active=false` only when `missed_runs >= 2`. **Never hard-delete**, because `location_ratings` and `status_reports` reference `locations.id`.
3. **Volume gates** (same idea as `sanity_check.py`): stop and hold if newly inactive rows exceed 10% of active rows, or if the total count drops more than 10%.
4. Write the diff counts into `etl_runs.stats` and set `status='promoted'`.
5. Clean up old data: delete `etl_tasks` and `locations_staging` rows for runs older than the last ~5.

**Policy:** from a held run, promote only additions. Moves and deactivations wait for a run that passes the gates, or for a manual `select promote_locations_run(id, force => true)`.

**Reviews:** reviews are found by point within 50 m, so moving a machine more than 50 m would orphan its reviews from the map's point of view. Because promotion updates the *same row* (stable `id` matched by `machineID`), the reviews follow the machine. Follow-up: switch `get-reviews` to look up by `machineID` (or `location.id`) instead of coordinates.

### 4.4 Serving the map

- **New route `GET /api/locations`.** It returns a GeoJSON `FeatureCollection` of `is_active` locations, built in SQL. Add a view or RPC `locations_geojson()` using `ST_AsGeoJSON`/`json_build_object` so Postgres does the formatting. Wrap the query in `unstable_cache(…, ['locations'], { tags: ['locations'], revalidate: 86400 })` so normal traffic never hits Supabase directly.
- **Feature properties:** `machineID`, `retailer`, `address`, `city`, `state`, and `location_id`. Drop `feature_index`.
- **`MapInstance.tsx`:** replace the static import with a fetch of `/api/locations`, through SWR or a server component that passes `collection` as a prop. Keep the current JSON as a **fallback** while the pipeline is new.
- **`LocationInfoPanel.tsx`:** stop indexing `machineData.features[feature_index]`. Coordinates are already in `info.latitude`/`info.longitude`, so use those directly (fixes G6).
- **`PokemonCenterLocationPins.tsx`:** the `<Source>` is memoised with `[]` deps. Add `collection` to the deps so new data actually renders.
- **Payload:** ~1.5k points (~4 MB today with Mapbox extras). With only the fields above it drops to roughly 200–300 KB, and less after gzip. A Mapbox tileset is not needed at this size.

### 4.5 Triggering

| Plan | Trigger `start` | Drive `work` until done |
|------|-----------------|-------------------------|
| **Vercel Pro** | `vercel.json` cron, e.g. `0 8 * * *` → `/api/etl/start` | Self-chaining, plus a `*/10 * * * *` cron → `/api/etl/work` as backup (does nothing when no run is active) |
| **Vercel Hobby** | GitHub Actions `schedule` → `curl -H "Authorization: Bearer $CRON_SECRET" …/api/etl/start` | Same GitHub Actions job loops `curl …/api/etl/work` until it returns `{ done: true }` (GitHub Actions jobs can run up to 6 h) |

`/api/etl/start` is idempotent. If a run is already `sweeping`, it returns that run instead of starting a second one. It also creates the grid seed tasks from the same constants the Python script uses (`CONUS_*`, 4° spans).

---

## 5. Alternative: keep the sweep off Vercel

If the Pokémon API blocks Vercel's IPs, or if porting to TypeScript isn't worth it yet:

- Run the existing Python script from GitHub Actions (or a small VM or home server with a residential IP). Change it to write a full snapshot with `run_id` instead of "skip existing + clear". Then call `promote_locations_run` and `POST /api/revalidate-locations` (secret-protected route that calls `revalidateTag('locations')`).
- Everything from §4.1, §4.3, and §4.4 stays the same. Only where the sweep runs changes.

**Suggested order:** do this first, because it reuses the working Python code and proves out promotion and serving. Then move the sweep to the Vercel worker (§4.2) once rate limiting from Vercel IPs has been tested with a small `--limit` run.

Other options considered:
- **Vercel Queues / Vercel Workflow (durable functions):** these would handle chaining and retries for us. Check whether they're GA and how they're priced. The Postgres task table does the same job with tools already in use.
- **Supabase `pg_cron` + Edge Functions:** possible, but Edge Functions have similar wall-clock limits, and this would put app logic in a second runtime.
- **Commit JSON + redeploy (current approach):** simple, but it creates a deploy per update, puts 4 MB files in git history, and the database and map can drift apart. Retire it once §4.4 ships.

---

## 6. Rollout

1. **Fix hygiene first:** restore `cloudscraper`/`beautifulsoup4`/`python-dotenv` in `scripts/requirements.txt`, or retire `scrape_and_merge.py` (G7). Regenerate `database.types.ts` (G8).
2. **Migration:** `etl_runs`, `etl_tasks`, staging `run_id`, lifecycle columns on `locations`, `etl_claim_tasks`, `promote_locations_run`, `locations_geojson`. Backfill `last_seen_at=now()` on current rows.
3. **Python snapshot mode:** add `--run-id` / snapshot behaviour to `scrape_vending_api_by_zip.py`. Run it once from local, call promote in dry-run mode (a `p_dry_run` flag that only returns stats), and review the diff.
4. **Serve from the DB:** `/api/locations` with a cache tag, the map fetches at runtime, `feature_index` removed, and the static JSON kept as a fallback. Ship this, then check that the point count matches.
5. **Automate:** a GitHub Actions workflow runs the sweep, then promote, then revalidate. Remove the "commit JSON" step from `weekly-update.yml`.
6. **(Optional) Move the sweep to Vercel:** TypeScript worker plus `/api/etl/start` and `/api/etl/work`, and cron in `vercel.json`. Run both for one cycle and compare `etl_runs.stats`.
7. **Clean up:** delete `src/data/vending_machines*.json` imports, `push_supabase.py`, and `sanity_check.py` (now in SQL).

## 7. Observability

- Each run's `etl_runs.stats`: requests, splits, capped leaves, failed tasks, added/moved/deactivated counts, duration.
- Alert on `held_for_review` or `failed`, and on "no `promoted` run in 3 days". A GitHub Actions failure email or a Discord webhook from the finalize step is enough.
- An admin-only `/api/etl/status` route that returns the latest runs, for quick checks.

## 8. Open questions

1. Hobby or Pro plan? This decides between Vercel Cron and a GitHub Actions trigger (§4.5).
2. Has the Pokémon API been tested from Vercel's or GitHub's IPs at full sweep volume? The 403 retry handling suggests blocking has already happened.
3. Should user-submitted (non-official) locations ever be deactivated by the pipeline? Proposal: no. Promotion only touches `is_official = true`.
4. Is the old `"Vending Machine Locations"` table (`src/lib/map/locations.ts`) still used? It looks dead and could be dropped.
5. How often should it run? Daily is plenty. The 2-miss deactivation rule means a removal shows up after about 2 days.
