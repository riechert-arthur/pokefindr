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
| `/api/locations/[id]`, `/api/highlights` | yes | CDN, as before |
| `/api/geocode` | yes | CDN, as before (it holds no PokeFindr data) |
| `/api/locations/aggregates`, `/cities`, `/counts`, `/retailers` | no | CDN (counts only) |

- **Why some caching moved to the browser.** BotID runs in our function, and a response the CDN
  serves never reaches it. A shared CDN copy of the map's bulk queries would go to any script that
  asked for the same box, so those are cached in the browser only. The details route needs an id
  from one of them, and highlights is a handful of places, so they keep the CDN.
- **Outside Vercel** (local dev, tests, CI) there's nothing to check against: `refuseBots()` lets
  every request through. The list of guarded paths is `src/lib/bot-checked-paths.ts`; a new data
  route needs adding there and a `refuseBots()` call.
- **BotID's script** is proxied through our domain under `/149e9513-…` (`withBotId` in
  `next.config.ts`); the middleware's matcher skips that path.
