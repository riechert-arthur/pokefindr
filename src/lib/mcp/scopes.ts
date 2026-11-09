/**
 * What an MCP client can ask a person for (#134); the consent page describes
 * each in the catalog (auth.consent.scopes). `openid` and `offline_access` are OAuth's own: which
 * account, and staying connected without signing in again. There's no
 * `profile` (or `email`): the tools don't need someone's name or photo, and
 * without those scopes no client can get those claims any other way.
 */
export const MCP_ACCOUNT_SCOPES = ["account:read", "places:submit"] as const
export type McpAccountScope = (typeof MCP_ACCOUNT_SCOPES)[number]

export const MCP_SCOPES = ["openid", "offline_access", ...MCP_ACCOUNT_SCOPES] as const

/** The MCP endpoint that needs an account, relative to the site. */
export const MCP_ACCOUNT_PATH = "/api/mcp/account"
