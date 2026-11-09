/** The OAuth providers PokeFindr can offer (each shown only when configured). */
export const OAUTH_PROVIDERS = ["google", "discord"] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

export const OAUTH_LABELS: Record<OAuthProvider, string> = { google: "Google", discord: "Discord" }
