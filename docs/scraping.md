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
| Bot Protection (managed) | every request | — | challenge non-browser traffic |
| Location data: block heavy scrapers | `/api/locations*`, `/api/highlights`, `/api/geocode` | 240 a minute | deny for an hour |
| Location data: rate limit | the same | 120 a minute | 429 until the minute is up |
| API: rate limit | `/api/*` | 600 a minute | 429 until the minute is up |

- **Why 429s, not challenges, on the API.** A challenge is a page a browser solves. The map's
  `fetch` calls can't show one, so a challenged API call would just break the map. Pages are
  challenged by Bot Protection; the API answers too many requests with a 429, then a denial.
- **Normal use.** Panning the map loads one viewport after it settles (250 ms), and search and
  geocoding are typed by hand, so a busy visitor makes a few dozen requests a minute. 120 leaves
  room for several people behind one IP (an office, a school).
- **Search engines.** Bot Protection lets verified bots (Googlebot, Bingbot) through, so pages
  stay indexed. They have no reason to call the API; BotID (#198) turns them away there.
- **Changing a limit.** Edit the file, run the dry run to see the difference, merge, then apply.
  To check a rule, loop requests from one machine (`for i in $(seq 300); do curl -s -o /dev/null
  -w "%{http_code}\n" "https://pokefindr.app/api/locations?bbox=…"; done | sort | uniq -c`)
  and expect 429s after 120 and 403s after 240.
