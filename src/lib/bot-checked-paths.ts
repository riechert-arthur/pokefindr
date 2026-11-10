/**
 * The API routes BotID guards (#198, docs/scraping.md): the ones that return
 * places, and the geocoder. The browser attaches BotID's header to these
 * (src/instrumentation-client.ts) and the routes check it (refuseBots).
 */
export const BOT_CHECKED_PATHS = ["/api/locations", "/api/locations/near", "/api/locations/search", "/api/locations/*", "/api/highlights", "/api/geocode"] as const
