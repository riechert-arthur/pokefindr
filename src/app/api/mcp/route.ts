import { getGeocoder } from "@/server/container"
import { getServerConfig } from "@/server/config"
import { getDb } from "@/server/db/client"
import { clientKeyFor, placeBudgetFor } from "@/server/mcp/limits"
import { mcpEndpoint, preflight, serveMcp } from "@/server/mcp/http"
import { createReadOnlyServer } from "@/server/mcp/server"

export const dynamic = "force-dynamic"
// A tool call is a database query and maybe a geocode.
export const maxDuration = 30

let handler: ReturnType<typeof mcpEndpoint> | undefined

/** Built on first use, so `next build` needs no config. */
function getHandler() {
  handler ??= mcpEndpoint(({ requestInfo }) => {
    const key = clientKeyFor(requestInfo?.headers ?? new Headers())
    return createReadOnlyServer({
      appUrl: getServerConfig().APP_URL,
      ctx: () => {
        const now = new Date()
        return { db: getDb(), geocoder: getGeocoder(), viewer: null, now, places: placeBudgetFor(key, now) }
      },
    })
  })
  return handler
}

/**
 * /api/mcp: PokeFindr's public MCP server (Streamable HTTP), read-only, no
 * sign-in. POST carries the MCP messages; GET and DELETE (2025 session
 * streams) answer 405, since every request stands alone.
 */
export const POST = (request: Request) => serveMcp(getHandler(), request, clientKeyFor(request.headers))
export const GET = POST
export const DELETE = POST
export const OPTIONS = preflight
