---
name: location-data
description: Rules for any PokeFindr code that reads or returns vending machine / location data - rate limits, BotID, query caps, canaries and the firewall - so a new endpoint, MCP tool, page or export doesn't reopen scraping holes. Use when adding or changing an API route, MCP tool, server component or job that returns locations, when touching src/server/api-rate-limit.ts, bot-check.ts, bot-checked-paths.ts, lib/locations/*, infra/vercel-firewall.json, or canaries.
---

# Serving location data

The location dataset is the product, so every path that returns it is protected in layers (R10, documented in `docs/scraping.md`). A new path that skips a layer undoes the others. Before shipping anything that returns locations, check each layer.

## The layers

1. **Vercel Firewall:** `infra/vercel-firewall.json`, applied by hand with `npm run firewall` (dry run), then `npm run firewall -- --apply`. Changing the file does nothing until someone applies it. Its first rule lets `/api/mcp`, `/api/identity`, `/api/jobs`, `/api/queues` and `/.well-known` through, because those are called by machines on purpose. Remember that list when adding machine-facing routes. `--apply` replaces the live config, including rules added in the dashboard; the dry run warns about those.

2. **BotID:** browser-facing data routes call `guardRoute(request, rule, { bots: true })` from `src/server/api-rate-limit.ts`. Add the exact path to `src/lib/bot-checked-paths.ts`, or the client never attaches the challenge and real browsers get refused. BotID checks only on Vercel production and fails open on errors.

3. **Shared rate limits:** `RATE_RULES` in `src/server/api-rate-limit.ts`, stored in Postgres (`api_rate_limits`) in production and in memory locally (`RATE_LIMIT_STORE`). Give a new route a rule sized to real use, not unlimited.

4. **Query caps** (`src/lib/locations/bbox.ts`, `search.ts`):
   - `GET /api/locations` needs a `bbox`;
   - boxes are capped at `MAX_BBOX_AREA`;
   - results are capped at `BBOX_LIMIT` / `NEAR_LIMIT`;
   - `queryFeatures` always takes a limit.

   Never add an endpoint, export or page that returns all locations, or lets a caller page through them without a bound.

5. **No exact coordinates where they aren't needed.** The landing hero gets 0.25° grid counts (`getVendingCells`), not points.

6. **Canaries:** a few planted locations (`locations.canary`, `npm run canary:plant`) are returned like real ones, so a copied dataset can be recognized. The `canary` flag must **never** be serialized. Don't filter canaries out of public results either; that defeats them. The repo is public, so never commit a list of canaries or anything that tells them apart.

## Checklist for a new or changed path

- Is it rate limited, and bot-checked if a browser calls it?
- Is every query bounded, by area and by count?
- Does the response leave out `canary` and other internal columns? Map rows to an explicit public shape; don't spread whole rows.
- Do the integration tests cover the limits (see `__tests__/integration/query-caps.test.ts`)?
- Is `docs/scraping.md` updated? If the firewall file changed, does the PR say it must be applied?
