# Scraping protection

How PokeFindr makes copying its location data slow, visible and provable (R10). The data is
what people come for, so it's shown freely in the app, but one script shouldn't be able to take
all of it in a few minutes.

## Vercel Firewall (#197)

The platform's firewall stops plain scripts before they reach our functions. Its configuration
lives in `infra/vercel-firewall.json`, and `npm run firewall` applies it:

```sh
VERCEL_TOKEN=… npm run firewall            # show what would change
VERCEL_TOKEN=… npm run firewall -- --apply # replace the live configuration
```

The file is the whole configuration: a rule changed in the dashboard is overwritten the next time
it's applied, so change the file instead, in a PR. `__tests__/server/firewall.test.ts` checks it.

| Rule | Matches | Limit per IP | Action |
| --- | --- | --- | --- |
| Machine clients: skip the browser checks | `/api/mcp*`, `/api/identity/*`, `/api/jobs/*`, `/api/queues/*`, `/.well-known/*` | — | bypass the rules below and Bot Protection |
| Bot Protection (managed) | every other request | — | challenge non-browser traffic |
| Location data: block heavy scrapers | `/api/locations*`, `/api/highlights`, `/api/geocode` | 240 a minute | deny for an hour |
| Location data: rate limit | the same | 120 a minute | 429 until the minute is up |
| API: rate limit | `/api/*` | 600 a minute | 429 until the minute is up |

- **Why 429s, not challenges, on the API.** A challenge is a page a browser solves. The map's
  `fetch` calls can't show one, so a challenged API call would just break the map. Pages are
  challenged by Bot Protection; the API answers too many requests with a 429, then a denial.
- **Normal use.** Panning the map loads one viewport after it settles (250 ms), and search and
  geocoding are typed by hand, so a busy visitor makes a few dozen requests a minute. 120 leaves
  room for several people behind one IP (an office, a school).
- **Machine clients.** MCP clients, their OAuth calls and Vercel's job and queue deliveries come
  from servers, not browsers, and often from a few shared IPs. They can't solve a challenge and
  would share one per-IP budget, so the first rule lets them past; they have their own limits
  (`src/server/mcp/limits.ts`, the signed job messages).
- **The heavy-scraper rule** is a rate limit whose action, past 240 a minute, is a one-hour deny.
  A rule whose own action is `deny` would block every request it matches.
- **Search engines.** Bot Protection lets verified bots (Googlebot, Bingbot) through, so pages
  stay indexed. They have no reason to call the API; BotID (#198) turns them away there.
- **Changing a limit.** Edit the file, run the dry run to see the difference (each rule added,
  changed or removed, and a warning for IP blocks or managed rules set only in the dashboard,
  which applying removes), merge, then apply.
  To check a rule, loop requests from one machine (`for i in $(seq 300); do curl -s -o /dev/null
  -w "%{http_code}\n" "https://pokefindr.app/api/locations?bbox=…"; done | sort | uniq -c`)
  and expect 429s after 120 and 403s after 240.

## BotID (#198)

Firewall rules key on IP addresses, which scrapers rotate. [BotID](https://vercel.com/docs/botid)
checks the client itself, invisibly: `src/instrumentation-client.ts` runs it in the browser and
attaches its header to the app's own requests for location data, and each of those routes calls
`refuseBots()` (`src/server/bot-check.ts`) first. A request without a valid header, `curl` or a
headless script, gets a 403 with the code `botBlocked`. Verified bots (search engines) get one
too: they index pages, not the API.

| Route | Checked | Cached |
| --- | --- | --- |
| `/api/locations?bbox=`, `/near`, `/search` | yes | in the browser only (30 s) |
| `/api/highlights` | on a CDN miss | CDN, as before (a handful of places) |
| `/api/geocode` | on a CDN miss | CDN, as before (it holds no PokeFindr data; a miss is what costs) |
| `/api/locations/[id]`, `/[id]/reviews` | no | CDN (one place, by an id only the checked routes give out) |
| `/api/locations/aggregates`, `/cities`, `/counts`, `/retailers` | no | CDN (counts only) |

- **Why some caching moved to the browser.** BotID runs in our function, and a response the CDN
  serves never reaches it. A shared CDN copy of the map's bulk queries would go to any script that
  asked for the same box, so those are cached in the browser only. The CDN-cached routes are only
  checked on a miss, which is fine for what they hold.
- **Only on a production deployment on Vercel** (`onVercelProduction()`): local dev (even with
  `vercel env pull`'s `VERCEL=1`), tests and CI let every request through, and so does a BotID
  error, logged, so an outage can't take the map down. The rate limits still apply.
- **Adding a route.** The list is `src/lib/bot-checked-paths.ts`, exact paths only (a wildcard
  would make the browser run BotID for routes that don't check). Each listed route calls
  `refuseBots()`, after its own validation; a test checks every listed route does.
- **End-to-end tests** call the API without a browser's BotID header, so against a Vercel
  deployment they'd get 403s. They run against `make run` locally and in CI, where BotID passes
  everything.
- **BotID's script** is proxied through our domain under `/149e9513-…` (`withBotId` in
  `next.config.ts`); the middleware's matcher skips that path.

## Shared rate limiter (#199)

Behind the firewall, the data routes keep their own per-client limits, in a bucket every server
instance shares, so the limit holds however many instances are running. Each data route starts
with `guardRoute()` (`src/server/api-rate-limit.ts`): the client's limit, and BotID where the
route is guarded, side by side. Over the limit is a 429 with `Retry-After`.

| Rule | Routes | Limit |
| --- | --- | --- |
| `locations` | every `GET /api/locations*`, `/api/highlights` | 40 at once, 120 a minute |
| `geocode` | `/api/geocode` | 20 at once, 60 a minute |

- **The client** is its IP, and an IPv6 address by its /64 (`rateLimitKey()`), since one home
  connection or server usually holds a whole /64. On Vercel the platform sets `X-Forwarded-For`,
  so a client can't pick its own; off Vercel, run it behind a proxy that does.
- **Shared IPs.** Everyone behind one IPv4 (a campus, a carrier's NAT) shares a bucket, here and in
  the firewall. 120 a minute is several busy people's worth; raise both if logs show real users
  getting 429s.
- **The store** is the `SharedRateLimiter` port (`src/server/ports/rate-limiter.ts`), chosen by
  `RATE_LIMIT_STORE` in `src/server/container.ts`: `postgres` in production (the
  `api_rate_limits` table, one upsert per request) and `memory` for local dev and tests. A
  client an instance has just refused is refused again from memory until its `Retry-After`, so a
  scraper's burst doesn't queue on its row. Idle rows are deleted nightly by the
  `prune-rate-limits` job. A Redis adapter would slot in the same way if Postgres became the
  bottleneck.
- **If the store fails or takes over 300 ms**, the request goes through and the error is logged:
  an outage of the limiter shouldn't take the map down. The firewall's limits still apply.
- The assistant, MCP and feedback limits are per user and stay in memory (`tokenBucket`, which
  shares its bucket math with the memory adapter).

## Caps on every query (#201)

The fewer places one request can return, the more requests a full copy takes, and the easier it is
to spot. No route returns every location: `queryFeatures()` always takes a limit, and
`__tests__/integration/query-caps.test.ts` seeds more places than any cap and checks each route.

| Route | Most rows | Most area | When there are more |
| --- | --- | --- | --- |
| `/api/locations?bbox=` (the map) | 500 | 300 square degrees | `truncated`; the pill says to zoom in |
| `/api/locations/near` (the results list) | 200 | a 50-mile radius | `truncated`; `counts` and `total` cover every match |
| `/api/locations/search` | 20 (5 by default) | — | — |
| `/api/locations/cities` | 30 cities | one state | counts only |
| `/api/locations/counts` | 10 points | a 50-mile radius each | counts only |
| `/api/locations/[id]` | 1 | — | — |
| `/api/highlights` | 4 hotspots, 3 events | — | — |
| `/api/locations/aggregates`, `/retailers` | counts per region, retailer names | — | no places |

- **Points from zoom 7.** Below `POINT_ZOOM` the map shades states from the aggregates; from 7 up it
  loads the places in view. At zoom 7 a 1440p screen shows about 28° × 11°; a bigger screen's box
  is shrunk around its center to 300 square degrees.
- **No list of everything.** `GET /api/locations` without a box is a 400. The map used to load
  every location to open `?location=` links instantly; it now looks in the places in view, then
  asks `/api/locations/[id]`.
- **The landing map** (#200) gets counts per 0.25° cell, rendered into the page, not points.
