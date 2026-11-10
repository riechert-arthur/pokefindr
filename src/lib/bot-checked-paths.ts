/**
 * The API routes BotID guards (#198, docs/scraping.md): the ones that list
 * places, the geocoder and street routes (#288). The browser attaches BotID's
 * header to these (src/instrumentation-client.ts) and each calls
 * refuseBots(). Exact paths:
 * a wildcard would make the browser run BotID for routes that don't check.
 */
export const BOT_CHECKED_PATHS = ["/api/locations", "/api/locations/near", "/api/locations/search", "/api/highlights", "/api/geocode", "/api/route"] as const
