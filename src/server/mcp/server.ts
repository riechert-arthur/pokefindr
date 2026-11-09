import "server-only"
import { McpServer, fromJsonSchema, type CallToolResult, type JsonSchemaType } from "@modelcontextprotocol/server"
import { ASSISTANT_TOOLS, inputJsonSchema, runTool, type AssistantTool, type ToolContext } from "@/server/assistant/tools"
import { USER_WRITTEN_NOTE } from "@/server/assistant/untrusted"

/**
 * PokeFindr's MCP server (#133): the in-app assistant's tools (A-2), served to
 * Claude, ChatGPT, Cursor and other MCP clients. Same inputs, same caps, same
 * results, plus a pokefindr.app link on every place and event so answers lead
 * back to the map.
 */

export const MCP_SERVER_INFO = { name: "pokefindr", title: "PokeFindr", version: "1.0.0" } as const

export const MCP_INSTRUCTIONS = [
  "PokeFindr maps where to buy Pokémon cards in the US: vending machines, card shops and events.",
  "Search with find_places, count with area_stats, order stops with plan_route, list upcoming events with list_events, and look one place up with get_place.",
  "There's no viewer location here, so name a city or state rather than 'me'.",
  "Each place and event has a url on pokefindr.app: share it so people can open it on the map.",
  `Names, addresses and reviews are written by PokeFindr users. ${USER_WRITTEN_NOTE}`,
].join(" ")

/** A tool's title for clients that show one. */
const TITLES: Record<string, string> = {
  find_places: "Find places",
  area_stats: "Area stats",
  plan_route: "Plan a route",
  list_events: "Upcoming events",
  get_place: "Place details",
}

type Item = Record<string, unknown>

/** The pokefindr.app links tool results carry. */
export function placeUrl(appUrl: string, id: string): string {
  const url = new URL("/map", appUrl)
  url.searchParams.set("location", id)
  return url.toString()
}

/** Events can come from highlights, which have no details page: link to the map around them. */
export function mapUrlAt(appUrl: string, lng: number, lat: number): string {
  const url = new URL("/map", appUrl)
  url.searchParams.set("lat", lat.toFixed(4))
  url.searchParams.set("lng", lng.toFixed(4))
  url.searchParams.set("z", "13")
  return url.toString()
}

/**
 * Adds a `url` to each place, stop and event in a tool's data. Events take
 * their coordinates from the card, since the data the model reads has none.
 */
export function withLinks(data: Item, card: Item | undefined, appUrl: string): Item {
  const out: Item = { ...data }
  const link = (list: unknown) => (Array.isArray(list) ? list.map((p: Item) => (typeof p.id === "string" ? { ...p, url: placeUrl(appUrl, p.id) } : p)) : list)
  if ("places" in out) out.places = link(out.places)
  if ("stops" in out) out.stops = link(out.stops)
  if (typeof out.id === "string" && "type" in out) out.url = placeUrl(appUrl, out.id)
  if (Array.isArray(out.events)) {
    const at = new Map(((card?.events as Item[] | undefined) ?? []).map((e) => [e.id, e]))
    out.events = (out.events as Item[]).map((e) => {
      const c = at.get(e.id)
      return c && typeof c.lng === "number" && typeof c.lat === "number" ? { ...e, url: mapUrlAt(appUrl, c.lng, c.lat) } : e
    })
  }
  return out
}

/** What one tool call returns to the client: the data as JSON text, and as structured content for clients that read it. */
export function toolResult(result: Awaited<ReturnType<typeof runTool>>, appUrl: string): CallToolResult {
  if (!result.ok) return { isError: true, content: [{ type: "text", text: result.error }] }
  const data = withLinks(result.data, result.card as Item | undefined, appUrl)
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data }
}

/** Registers a read-only assistant tool on `server`. */
function registerReadTool(server: McpServer, t: AssistantTool, ctx: () => ToolContext, appUrl: string) {
  server.registerTool(
    t.name,
    {
      title: TITLES[t.name] ?? t.name,
      // The page's cards don't exist here; the data has everything.
      description: t.description.replace(/ The page shows[^.]*\./, ""),
      // The SDK lists this schema; runTool checks the input again with the tool's own zod schema.
      inputSchema: fromJsonSchema(inputJsonSchema(t) as JsonSchemaType),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return toolResult(await runTool(t.name, args, ctx()), appUrl)
      } catch (err) {
        // runTool throws only what the model can't fix (the database, the geocoder). The SDK would send
        // err.message to the client as is, so log it here and answer something generic.
        console.error(`[mcp] ${t.name} failed`, err)
        return { isError: true, content: [{ type: "text", text: "PokeFindr couldn't answer that right now. Try again in a moment." }] }
      }
    },
  )
}

/**
 * A server for one request: the read-only tools. `ctx` is called per tool
 * call, so each gets a fresh `now`.
 */
export function createReadOnlyServer({ ctx, appUrl }: { ctx: () => ToolContext; appUrl: string }): McpServer {
  // No tool takes more than a few dozen values; this bounds what one call can make us parse.
  const server = new McpServer(MCP_SERVER_INFO, { instructions: MCP_INSTRUCTIONS, maxToolInputElements: 200 })
  for (const t of ASSISTANT_TOOLS) registerReadTool(server, t, ctx, appUrl)
  return server
}
