import "server-only"
import { getVercelOidcToken } from "@vercel/oidc"
import type { ServerConfig } from "@/server/config"

/** Returns a fresh OIDC identity token for this platform each time it's called. */
export type IdentityTokenSource = () => Promise<string>

/**
 * Where the assistant's identity comes from for workload identity
 * federation (#226): Vercel's OIDC token in a Vercel function, or a GitHub
 * Actions token in a workflow with `id-token: write` (the evals). Either is
 * a short-lived JWT naming the project and environment, which the federation
 * rule checks before Anthropic issues a token.
 */
export function identityTokenSource(config: ServerConfig): IdentityTokenSource {
  const source = config.ANTHROPIC_IDENTITY_SOURCE ?? (config.VERCEL ? "vercel" : config.ACTIONS_ID_TOKEN_REQUEST_URL ? "github-actions" : null)
  if (source === "vercel") return () => getVercelOidcToken()
  if (source === "github-actions") {
    const url = config.ACTIONS_ID_TOKEN_REQUEST_URL
    const token = config.ACTIONS_ID_TOKEN_REQUEST_TOKEN
    if (!url || !token) throw new Error("GitHub Actions identity needs `permissions: id-token: write` on the job")
    return async () => {
      const request = new URL(url)
      if (config.ANTHROPIC_IDENTITY_AUDIENCE) request.searchParams.set("audience", config.ANTHROPIC_IDENTITY_AUDIENCE)
      const res = await fetch(request, { headers: { Authorization: `bearer ${token}` } })
      if (!res.ok) throw new Error(`GitHub Actions identity token request failed (${res.status})`)
      const { value } = (await res.json()) as { value?: string }
      if (!value) throw new Error("GitHub Actions returned no identity token")
      return value
    }
  }
  throw new Error("Workload identity federation is configured, but there's no identity here: run on Vercel or in GitHub Actions, or set ANTHROPIC_IDENTITY_SOURCE")
}
