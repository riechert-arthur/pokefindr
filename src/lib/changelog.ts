import type { Messages } from "@/i18n/messages"

/** A release's messages in `content.changelog` (`v1_2`): its intro, items and highlights. Not `title`, `meta` or `modal`. */
type ReleaseKey = Extract<keyof Messages["content"]["changelog"], `v${number}_${number}`>

// The group is written out in each template: the catalog check reads these to know the keys are used.
const items = <K extends string, I extends string>(release: K, list: readonly I[]) => list.map((item) => `${release}.items.${item}` as const)
const highlights = <K extends string, I extends string>(release: K, list: readonly I[]) => list.map((item) => `${release}.highlights.${item}` as const)

interface Release {
  version: string
  key: ReleaseKey
  /** The day it reached production (yyyy-mm-dd): the only place the date is written. */
  published: `${number}-${number}-${number}`
  /** Its changes on the changelog page, in order. */
  items: readonly string[]
  /** A shorter list for the pop-up that announces it, when it's the newest. */
  highlights?: readonly string[]
}

/**
 * Each release, oldest first, with the keys of its changes
 * (`content.changelog`). The sitemap gives the changelog the newest one's
 * date, and the pop-up announces the newest.
 */
export const CHANGELOG_RELEASES = [
  { version: "1.1", key: "v1_1", published: "2025-05-10", items: items("v1_1", ["load", "grouping", "precise", "data", "zoom", "search", "ui", "discord"]) },
  {
    version: "1.2",
    key: "v1_2",
    published: "2025-05-19",
    items: items("v1_2", ["accounts", "reviews", "settings", "sso", "ratings"]),
  },
  // The redesign (R0 to R11). `published` is the day it reaches production: move it if that changes (#347).
  {
    version: "2.0",
    key: "v2_0",
    published: "2026-11-11",
    items: items("v2_0", ["design", "search", "kinds", "states", "details", "add", "assistant", "routes", "chat", "mcp", "spanish", "profile"]),
    highlights: highlights("v2_0", ["design", "map", "assistant", "spanish"]),
  },
] as const satisfies readonly Release[]

/** Newest first, as the changelog page lists them. */
export const CHANGELOG_NEWEST_FIRST: readonly (typeof CHANGELOG_RELEASES)[number][] = [...CHANGELOG_RELEASES].reverse()

/** The newest release (the list is oldest first). */
export const NEWEST_RELEASE = CHANGELOG_RELEASES[CHANGELOG_RELEASES.length - 1]

/** When the newest release came out. */
export const CHANGELOG_UPDATED = NEWEST_RELEASE.published

/** A release's day as a Date for the "released" message: noon UTC, so it's the same day in every time zone people read it in. */
export const releasedOn = (release: { published: string }) => new Date(`${release.published}T12:00:00Z`)
