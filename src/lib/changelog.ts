import type { Messages } from "@/i18n/messages"

/** A release's messages in `content.changelog` (`v1_2`): its date, intro and items. Not `title`, `meta` or `modal`. */
type ReleaseKey = Extract<keyof Messages["content"]["changelog"], `v${number}_${number}`>

const ids = <K extends string, I extends string>(release: K, items: readonly I[]) => items.map((item) => `${release}.items.${item}` as const)

/**
 * Each release, oldest first, with the keys of its changes in order
 * (`content.changelog`). `published` (yyyy-mm-dd) is the date in the release's
 * "released" message (a test checks they agree); the sitemap gives the
 * changelog the newest one's date, and the pop-up announces the newest.
 */
export const CHANGELOG_RELEASES = [
  { version: "1.1", key: "v1_1", published: "2025-05-10", items: ids("v1_1", ["load", "grouping", "precise", "data", "zoom", "search", "ui", "discord"]) },
  { version: "1.2", key: "v1_2", published: "2025-05-19", items: ids("v1_2", ["accounts", "reviews", "settings", "sso", "ratings"]) },
] as const satisfies readonly { version: string; key: ReleaseKey; published: `${number}-${number}-${number}`; items: readonly string[] }[]

/** The newest release (the list is oldest first). */
export const NEWEST_RELEASE = CHANGELOG_RELEASES[CHANGELOG_RELEASES.length - 1]

/** When the newest release came out. */
export const CHANGELOG_UPDATED = NEWEST_RELEASE.published
