/**
 * Picking up an MCP client's authorization after logging in (#134).
 *
 * When someone without a session connects an MCP client, Better Auth's
 * authorize endpoint sends them to /login with the request in the query,
 * signed. Our login goes through our own routes, not Better Auth's sign-in,
 * so the plugin can't resume it on its own: once logged in, the page sends
 * the browser back to the authorize endpoint with the same request. That
 * endpoint checks the client and its redirect URI again, then asks for
 * consent. Only that path is ever a destination, so `next` can't be used to
 * send people elsewhere.
 */
export const AUTHORIZE_PATH = "/api/identity/oauth2/authorize"

/** What Better Auth adds to sign the request; the authorize endpoint doesn't want them back. */
const SIGNING_PARAMS = ["sig", "exp", "ba_iat", "ba_pl", "ba_param"]

type Query = Record<string, string | string[] | undefined>

/**
 * The authorize URL to go back to, from the login page's query, or null when
 * it isn't an authorization request. A `login` prompt (sign in again) is met
 * by the login that just happened, so it's dropped along with `max_age`.
 */
export function authorizeContinuation(query: Query | URLSearchParams): string | null {
  const params = new URLSearchParams()
  const entries = query instanceof URLSearchParams ? [...query.entries()] : Object.entries(query).flatMap(([k, v]) => (v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x] as const)))
  for (const [k, v] of entries) params.append(k, v)
  if (!params.get("client_id") || !params.get("sig") || params.get("response_type") !== "code") return null
  for (const p of SIGNING_PARAMS) params.delete(p)
  const prompts = (params.get("prompt") ?? "").split(" ").filter((p) => p && p !== "login")
  if (prompts.length) params.set("prompt", prompts.join(" "))
  else params.delete("prompt")
  params.delete("max_age")
  return `${AUTHORIZE_PATH}?${params}`
}

/** `next` from a query, kept only when it's the authorize endpoint. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith(`${AUTHORIZE_PATH}?`)) return null
  // Same origin only: no "//host", backslashes or encoded tricks survive URL parsing as the same path.
  try {
    const url = new URL(next, "https://pokefindr.invalid")
    return url.origin === "https://pokefindr.invalid" && url.pathname === AUTHORIZE_PATH ? `${url.pathname}${url.search}` : null
  } catch {
    return null
  }
}

/** The /login/callback URL that comes back to `next` after Google or Discord. */
export const callbackWithNext = (next: string | null) => (next ? `/login/callback?next=${encodeURIComponent(next)}` : "/login/callback")
