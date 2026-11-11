// @vitest-environment node
import { describe, expect, it } from "vitest"
import { createTranslator } from "next-intl"
import { CHANGELOG_NEWEST_FIRST, CHANGELOG_RELEASES, CHANGELOG_UPDATED, NEWEST_RELEASE, releasedOn } from "@/lib/changelog"
import { MESSAGES } from "@/i18n/all-messages"
import { noindex } from "@/i18n/seo"

describe("the changelog's releases (#255, #347)", () => {
  it("dates each release once, the same day in every language and time zone", () => {
    const released = (locale: "en" | "es") => createTranslator({ locale, messages: MESSAGES[locale], namespace: "content.changelog", timeZone: "Pacific/Honolulu" })
    expect(released("en")("released", { date: releasedOn({ published: "2026-11-11" }) })).toBe("Released November 11, 2026")
    expect(released("es")("released", { date: releasedOn({ published: "2026-11-11" }) })).toBe("Publicada el 11 de noviembre de 2026")
    const tokyo = createTranslator({ locale: "en", messages: MESSAGES.en, namespace: "content.changelog", timeZone: "Asia/Tokyo" })
    expect(tokyo("released", { date: releasedOn({ published: "2025-05-10" }) })).toBe("Released May 10, 2025")
    for (const release of CHANGELOG_RELEASES) expect(Number.isNaN(releasedOn(release).getTime()), release.version).toBe(false)
  })

  it("lists them oldest first, so the newest is last, and the page newest first", () => {
    const dates = CHANGELOG_RELEASES.map((r) => r.published)
    expect(dates).toEqual([...dates].sort())
    expect(CHANGELOG_UPDATED).toBe(NEWEST_RELEASE.published)
    expect(CHANGELOG_NEWEST_FIRST[0]).toBe(NEWEST_RELEASE)
  })

  it("gives the newest release highlights for the pop-up", () => {
    expect("highlights" in NEWEST_RELEASE && NEWEST_RELEASE.highlights.length).toBeGreaterThan(0)
  })
})

describe("noindex (#255)", () => {
  it("keeps the layout's nofollow for a language that isn't public", () => {
    expect(noindex("en")).toEqual({ index: false, follow: true })
    expect(noindex("xx")).toEqual({ index: false, follow: false })
  })
})
