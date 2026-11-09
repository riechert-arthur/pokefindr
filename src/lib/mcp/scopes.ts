/**
 * What an MCP client can ask a person for (#134), and how the consent page
 * describes it. `openid`, `profile` and `offline_access` are OAuth's own:
 * who you are, and staying connected without signing in again.
 */
export const MCP_ACCOUNT_SCOPES = ["account:read", "places:submit"] as const
export type McpAccountScope = (typeof MCP_ACCOUNT_SCOPES)[number]

export const MCP_SCOPES = ["openid", "profile", "offline_access", ...MCP_ACCOUNT_SCOPES] as const

/** The consent page's line for each scope; ones not listed aren't shown. */
export const SCOPE_LABELS: Record<string, string> = {
  profile: "See your username",
  "account:read": "See your reviews and the places you've submitted",
  "places:submit": "Submit card shops and events for review, as you",
  offline_access: "Stay connected until you disconnect it",
}

/** The MCP endpoint that needs an account, relative to the site. */
export const MCP_ACCOUNT_PATH = "/api/mcp/account"
