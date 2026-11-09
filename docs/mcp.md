# MCP server

PokeFindr serves its assistant's tools over the [Model Context Protocol](https://modelcontextprotocol.io),
so people can search it from Claude, ChatGPT, Cursor and other MCP clients.

| Endpoint | Sign-in | Tools |
| --- | --- | --- |
| `https://pokefindr.app/api/mcp` | none | `find_places`, `area_stats`, `plan_route`, `list_events`, `get_place` |

## How it fits together

| Piece | Where |
| --- | --- |
| The tools (shared with the in-app assistant) | `src/server/assistant/tools.ts` |
| The MCP server: tool registration, links back to the map | `src/server/mcp/server.ts` |
| HTTP: CORS, the body cap, rate-limit answers | `src/server/mcp/http.ts` |
| Per-client limits | `src/server/mcp/limits.ts` |
| The route | `src/app/api/mcp/route.ts` |

It uses version 2 of the official TypeScript SDK (`@modelcontextprotocol/server`) over Streamable
HTTP. Every request gets its own server instance and there are no MCP sessions, so any serverless
instance can answer any request. Clients on the 2026-07-28 protocol and on the 2025 one are both
served. GET and DELETE (2025 session streams) answer 405.

The tools are the assistant's own: the same inputs, caps (10 places a call) and text cleaning.
Each place, route stop and event in a result carries a `url` on the site (`/map?location=<id>`,
or the map around an event), so answers lead back to the map. Results come as JSON text and as
`structuredContent`. An input the model can fix (an unknown city, a bad id) comes back as a tool
error with a message saying what to change.

## Limits

A client is its IP (an IPv6 /64).

- 30 requests a minute; past that, a 429 with `Retry-After: 60`.
- 200 distinct places a day, as the assistant allows. Places already shown that day stay free;
  past the cap, tools answer with an error pointing to the map.

Like the assistant's per-minute bucket, both live in each server instance's memory until the
shared limiter (#199) lands, so with several instances the real limit is a multiple of these.

## Trying it locally

```bash
npm run dev
npx @modelcontextprotocol/inspector   # then connect to http://localhost:3000/api/mcp (Streamable HTTP)
```

`__tests__/integration/mcp.test.ts` connects the SDK's own client to the route, over both
protocol versions.
