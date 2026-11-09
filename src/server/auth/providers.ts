import "server-only"
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/auth/providers"
import type { ServerConfig } from "@/server/config"

/** The OAuth providers with an id and secret configured: the ones login and sign-up offer. */
export function oauthProviders(config: Pick<ServerConfig, "GOOGLE_CLIENT_ID" | "DISCORD_CLIENT_ID">): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter((p) => config[p === "google" ? "GOOGLE_CLIENT_ID" : "DISCORD_CLIENT_ID"])
}
