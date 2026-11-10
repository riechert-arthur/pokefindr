# MCP server

PokeFindr serves its assistant's tools over the [Model Context Protocol](https://modelcontextprotocol.io),
so people can search it from Claude, ChatGPT, Cursor and other MCP clients.

| Endpoint | Sign-in | Tools |
| --- | --- | --- |
| `https://pokefindr.app/api/mcp` | none | `find_places`, `area_stats`, `plan_route`, `list_events`, `get_place` |
| `https://pokefindr.app/api/mcp/account` | OAuth (a PokeFindr account) | the same, plus `my_reviews`, `my_submissions`, `submit_place` |

## How it fits together

| Piece | Where |
| --- | --- |
| The tools (shared with the in-app assistant) | `src/server/assistant/tools.ts` |
| The MCP server: tool registration, links back to the map | `src/server/mcp/server.ts` |
| HTTP: CORS, the body cap, rate-limit answers | `src/server/mcp/http.ts` |
| Per-client limits | `src/server/mcp/limits.ts` |
| The routes | `src/app/api/mcp/route.ts`, `src/app/api/mcp/account/route.ts` |
| The account tools | `src/server/mcp/account-tools.ts` |

It uses version 2 of the official TypeScript SDK (`@modelcontextprotocol/server`) over Streamable
HTTP. Every request gets its own server instance and there are no MCP sessions, so any serverless
instance can answer any request. Clients on the 2026-07-28 protocol and on the 2025 one are both
served. GET and DELETE (2025 session streams) answer 405.

The tools are the assistant's own: the same inputs, caps (10 places a call) and text cleaning.
Reviews held for a moderator never appear in `get_place` ([moderation.md](moderation.md)).
Each place, route stop and event in a result carries a `url` on the site (`/map?location=<id>`,
or the map around an event), so answers lead back to the map. Results come as JSON text and as
`structuredContent`. An input the model can fix (an unknown city, a bad id) comes back as a tool
error with a message saying what to change.

## Signed in (/api/mcp/account)

Without a token, `/api/mcp/account` answers 401 with a `WWW-Authenticate` header naming its
protected-resource document, which is how MCP clients start signing in. The OAuth side
(registration, login, consent, tokens) is in [auth.md](auth.md#mcp-clients-oauth).

| Tool | Scope | What it does |
| --- | --- | --- |
| `my_reviews` | `account:read` | The person's reviews, newest 20, with each one's status (published, held for a moderator, removed) |
| `my_submissions` | `account:read` | Their submissions and each one's status (pending, approved, rejected with the reason, ended) |
| `submit_place` | `places:submit` | Adds a card shop or event for review, as them |

A token without a tool's scope gets a 403 with an `insufficient_scope` challenge naming it, so the
client can ask for it. `submit_place` geocodes the street address (only a street-level match in the
given state), then goes through the same checks, five-a-day limit, duplicate check and moderator
email as the Add a place form. When places of the same kind are within 150 m it returns them
instead of submitting; the model asks the person and calls again with `confirm_duplicate`.

The token's account is checked on every request (a deleted account's token still verifies for up
to an hour). Signed in, the limits are per person, and the 200 places a day are shared with the
in-app assistant.

## Limits

A client is its IP (an IPv6 /64), or its person once signed in.

- 30 requests a minute; past that, a 429 with `Retry-After: 60`.
- 200 distinct places a day, as the assistant allows. Places already shown that day stay free;
  past the cap, tools answer with an error pointing to the map.

A signed-in person's places are counted in Postgres with the assistant's. The per-minute limit and
an anonymous client's places live in each server instance's memory until the shared limiter (#199)
lands, so with several instances the real limit is a multiple of these.

## Trying it locally

```bash
npm run dev
npx @modelcontextprotocol/inspector   # then connect to http://localhost:3000/api/mcp (Streamable HTTP)
```

`__tests__/integration/mcp.test.ts` connects the SDK's own client to the route, over both
protocol versions.

## Listing it in MCP directories

`/developers` has setup steps for Claude, Claude Code, ChatGPT, Cursor, VS Code and other clients,
and the footer links to it.

`server.json` describes both endpoints for the [official MCP Registry](https://registry.modelcontextprotocol.io),
under the GitHub namespace `io.github.riechert-arthur/pokefindr`. To publish it (or a new version,
after bumping `version`), as the repo owner:

```bash
brew install mcp-publisher        # or download it from the registry's GitHub releases
mcp-publisher validate
mcp-publisher login github        # device-code sign-in as riechert-arthur
mcp-publisher publish
```

Directories that read the registry pick it up from there. Others take a submission by hand, with
the name, the description in `server.json`, the URL `https://pokefindr.app/api/mcp` and the
`/developers` link.
