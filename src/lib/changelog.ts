import type { Messages } from "@/i18n/messages"

/** A release's messages in `content.changelog`: its title, date, intro and items. */
type ReleaseKey = keyof Messages["content"]["changelog"]

const ids = <K extends string, I extends string>(release: K, items: readonly I[]) => items.map((item) => `${release}.items.${item}` as const)

/**
 * Each release, oldest first, with the keys of its changes in order
 * (`content.changelog`). `published` (yyyy-mm-dd) matches the release's
 * "released" message; the sitemap gives the changelog the newest one's date.
 */
export const CHANGELOG_RELEASES = [
  { version: "1.1", key: "v1_1", published: "2025-05-10", items: ids("v1_1", ["load", "grouping", "precise", "data", "zoom", "search", "ui", "discord"]) },
  { version: "1.2", key: "v1_2", published: "2025-05-19", items: ids("v1_2", ["accounts", "reviews", "settings", "sso", "ratings"]) },
] as const satisfies readonly { version: string; key: ReleaseKey; published: `${number}-${number}-${number}`; items: readonly string[] }[]

/** When the newest release came out. */
export const CHANGELOG_UPDATED = CHANGELOG_RELEASES.map((r) => r.published).sort().at(-1)!
