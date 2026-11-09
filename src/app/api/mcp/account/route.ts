import { requireMcpAuth } from "@better-auth/mcp"
import type { JWTPayload } from "jose"
import { getAuth, mcpResource } from "@/server/auth/auth"
import { getGeocoder } from "@/server/container"
import { getServerConfig } from "@/server/config"
import { getDb } from "@/server/db/client"
import { loadPlaceBudget, savePlaceViews } from "@/server/assistant/limits"
import type { PlaceBudget } from "@/server/assistant/limits"
import { grantStands } from "@/server/services/oauth-clients"
import { MCP_ACCOUNT_SCOPES } from "@/lib/mcp/scopes"
import { mcpEndpoint, preflight, rpcError, serveMcp, withCors } from "@/server/mcp/http"
import { oneAtATime } from "@/server/mcp/limits"
import { createAccountServer } from "@/server/mcp/server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

let handler: ReturnType<typeof mcpEndpoint> | undefined

/** Built on first use. The signed-in person comes in `authInfo.extra`. */
function getHandler() {
  handler ??= mcpEndpoint(({ authInfo }) => {
    const { userId } = authInfo!.extra as { userId: string }
    const base = (now: Date) => ({ db: getDb(), geocoder: getGeocoder(), viewer: null, now })
    return createAccountServer({
      appUrl: getServerConfig().APP_URL,
      userId,
      ctx: () => base(new Date()),
      withCtx: (call) => withPlaceBudget(userId, (places, now) => call({ ...base(now), places })),
    })
  })
  return handler
}

/**
 * Runs one tool call with the person's places shown today: loaded before it,
 * and what it showed saved right after, one call per person at a time. So
 * the cap holds across calls that come at once, and for 2025-era clients,
 * whose response streams back before the tool has run. The count is shared
 * with the in-app assistant.
 */
async function withPlaceBudget<T>(userId: string, call: (places: PlaceBudget, now: Date) => Promise<T>): Promise<T> {
  return oneAtATime(`places:${userId}`, async () => {
    const db = getDb()
    const now = new Date()
    const places = await loadPlaceBudget(userId, now, db)
    try {
      return await call(places, now)
    } finally {
      await savePlaceViews(userId, now, places, db).catch((err) => console.error("[mcp] couldn't record the places shown", err))
    }
  })
}

/** One request with a verified token: the person's own limits. */
async function serveAccount(request: Request, claims: JWTPayload): Promise<Response> {
  const userId = claims.sub!
  // A JWT is checked without the database: make sure the account, the person's approval and the app still stand.
  if (!(await grantStands(userId, String(claims.azp ?? ""), getDb()))) return rpcError(401, "This app is no longer connected to a PokeFindr account. Connect it again.")
  const authInfo = {
    token: "",
    clientId: String(claims.azp ?? ""),
    scopes: String(claims.scope ?? "").split(" ").filter(Boolean),
    expiresAt: claims.exp,
    resource: new URL(mcpResource(getServerConfig())),
    extra: { userId },
  }
  return serveMcp(getHandler(), request, `user:${userId}`, authInfo)
}

/**
 * /api/mcp/account: the MCP server as the signed-in person (#134). Needs an
 * OAuth access token from PokeFindr for this URL; without one it answers 401
 * with a WWW-Authenticate header pointing at the protected-resource
 * document, which is how clients start signing in.
 */
export async function POST(request: Request): Promise<Response> {
  const config = getServerConfig()
  const guarded = requireMcpAuth(getAuth(), serveAccount, { resource: mcpResource(config), challengeScopes: [...MCP_ACCOUNT_SCOPES] })
  return withCors(await guarded(request))
}
export const GET = POST
export const DELETE = POST
export const OPTIONS = preflight
