import type { Messages } from "@/i18n/messages"

/** Support: the PokeFindr Discord. The footer, app rail, FAQ and error pages all link here. */
export const SUPPORT_URL = "https://discord.gg/f2uUR5bAZU"

/** The site's public links, by their `content.nav` message key. The footer and the content pages' header each pick theirs from here. */
export const SITE_LINKS = {
  map: "/map",
  blog: "/blog",
  support: SUPPORT_URL,
  changelog: "/changelog",
  dashboard: "/home",
  developers: "/developers",
  privacy: "/privacy-policy",
  terms: "/terms-of-service",
} as const satisfies Record<keyof Messages["content"]["nav"], string>

export type SiteLink = keyof typeof SITE_LINKS
