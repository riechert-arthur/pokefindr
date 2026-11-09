import { requireMcpAuth } from "@better-auth/mcp"
import type { JWTPayload } from "jose"
import { getAuth, mcpResource } from "@/server/auth/auth"
import { getGeocoder } from "@/server/container"
import { getServerConfig } from "@/server/config"
import { getDb } from "@/server/db/client"
import { loadPlaceBudget, savePlaceViews } from "@/server/assistant/limits"
import type { PlaceBudget } from "@/server/assistant/limits"
import { getProfile } from "@/server/services/users"
import { MCP_ACCOUNT_SCOPES } from "@/lib/mcp/scopes"
import { mcpEndpoint, preflight, rpcError, serveMcp, withCors } from "@/server/mcp/http"
import { createAccountServer } from "@/server/mcp/server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

let handler: ReturnType<typeof mcpEndpoint> | undefined

/** Built on first use. The signed-in person and their place budget come in `authInfo.extra`. */
function getHandler() {
  handler ??= mcpEndpoint(({ authInfo }) => {
    const { userId, places, now } = authInfo!.extra as { userId: string; places: PlaceBudget; now: Date }
    return createAccountServer({
      appUrl: getServerConfig().APP_URL,
      userId,
      ctx: () => ({ db: getDb(), geocoder: getGeocoder(), viewer: null, now, places }),
    })
  })
  return handler
}

/** One request with a verified token: the person's limits and places shown today are their own, shared with the in-app assistant. */
async function serveAccount(request: Request, claims: JWTPayload): Promise<Response> {
  const userId = claims.sub!
  const db = getDb()
  // The token outlives a deleted account by up to an hour.
  if (!(await getProfile(userId, db))) return rpcError(401, "This PokeFindr account no longer exists.")
  const now = new Date()
  const places = await loadPlaceBudget(userId, now, db)
  const authInfo = {
    token: "",
    clientId: String(claims.azp ?? ""),
    scopes: String(claims.scope ?? "").split(" ").filter(Boolean),
    expiresAt: claims.exp,
    resource: new URL(mcpResource(getServerConfig())),
    extra: { userId, places, now },
  }
  const res = await serveMcp(getHandler(), request, `user:${userId}`, authInfo)
  await savePlaceViews(userId, now, places, db).catch((err) => console.error("[mcp] couldn't record the places shown", err))
  return res
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
