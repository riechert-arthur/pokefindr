/**
 * What an MCP client can ask a person for (#134), and how the consent page
 * describes it. `openid` and `offline_access` are OAuth's own: which
 * account, and staying connected without signing in again. There's no
 * `profile` (or `email`): the tools don't need someone's name or photo, and
 * without those scopes no client can get those claims any other way.
 */
export const MCP_ACCOUNT_SCOPES = ["account:read", "places:submit"] as const
export type McpAccountScope = (typeof MCP_ACCOUNT_SCOPES)[number]

export const MCP_SCOPES = ["openid", "offline_access", ...MCP_ACCOUNT_SCOPES] as const

/** The consent page's line for each scope; ones not listed aren't shown. */
export const SCOPE_LABELS: Record<string, string> = {
  "account:read": "See your reviews and the places you've submitted",
  "places:submit": "Submit card shops and events for review, as you",
  offline_access: "Stay connected until you disconnect it",
}

/** The MCP endpoint that needs an account, relative to the site. */
export const MCP_ACCOUNT_PATH = "/api/mcp/account"
