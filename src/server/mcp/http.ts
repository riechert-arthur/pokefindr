import "server-only"
import { createMcpHandler, type McpHttpHandler, type McpServerFactory } from "@modelcontextprotocol/server"
import { takeRequest } from "./limits"

/** Largest MCP request body read: tool inputs are a few hundred bytes. */
export const MAX_BODY_BYTES = 64 * 1024

/**
 * CORS for browser-based MCP clients (the MCP Inspector, web IDEs). No
 * cookies are read on these routes, only a bearer token, so any origin may
 * call them.
 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID, DPoP",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version, Retry-After",
  "Access-Control-Max-Age": "86400",
} as const

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS })

export function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

/** A JSON-RPC error outside any request, as MCP clients expect from HTTP failures. */
export function rpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return withCors(Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers }))
}

/**
 * An MCP endpoint over Streamable HTTP. Each request gets its own server
 * from `factory` (no MCP sessions, so any instance can answer). 2026-07-28
 * clients and 2025-era ones are both served: most clients in use still
 * speak the 2025 protocol.
 */
export function mcpEndpoint(factory: McpServerFactory): McpHttpHandler {
  return createMcpHandler(factory, {
    legacy: "stateless",
    maxRequestBodySize: MAX_BODY_BYTES,
    onerror: (err) => console.error("[mcp]", err),
  })
}

/** Serves one request for the client `key`, after its rate limit. */
export async function serveMcp(handler: McpHttpHandler, request: Request, key: string): Promise<Response> {
  if (!takeRequest(key)) return rpcError(429, "Too many requests. Wait a minute and try again.", { "Retry-After": "60" })
  try {
    return withCors(await handler.fetch(request))
  } catch (err) {
    console.error("[mcp] request failed", err)
    return rpcError(500, "Something went wrong. Try again.")
  }
}
