import "server-only"
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider"
import { authHandler, getAuth } from "@/server/auth/auth"
import { getServerConfig } from "@/server/config"

/**
 * OAuth discovery documents for MCP clients (#134), at the site root where
 * RFC 8414 and RFC 9728 put them. Better Auth serves its endpoints under
 * /api/identity, so these routes hand it the requests. Any origin may read
 * them: they're public, and browser-based clients need CORS.
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version" }

export const discoveryPreflight = () => new Response(null, { status: 204, headers: CORS })

/** /.well-known/oauth-authorization-server[/api/identity] (RFC 8414). */
export const authorizationServerMetadata = (request: Request) => oauthProviderAuthServerMetadata(getAuth(), { headers: CORS })(request)

/** /.well-known/openid-configuration[/api/identity]: the same, for clients that look for OpenID's. */
export const openIdConfiguration = (request: Request) => oauthProviderOpenIdConfigMetadata(getAuth(), { headers: CORS })(request)

/**
 * /.well-known/oauth-protected-resource[/api/mcp/account] (RFC 9728): which
 * authorization server issues tokens for the MCP account endpoint. The mcp
 * plugin answers it by path, so the request goes to Better Auth as is.
 */
export async function protectedResourceMetadata(request: Request): Promise<Response> {
  const res = await authHandler(new Request(new URL(new URL(request.url).pathname, getServerConfig().APP_URL), { method: request.method, headers: request.headers }))
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}
