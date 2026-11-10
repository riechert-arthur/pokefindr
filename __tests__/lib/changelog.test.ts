// @vitest-environment node
import { describe, expect, it } from "vitest"
import { CHANGELOG_RELEASES, CHANGELOG_UPDATED, NEWEST_RELEASE } from "@/lib/changelog"
import { MESSAGES } from "@/i18n/all-messages"
import { noindex } from "@/i18n/seo"

describe("the changelog's releases (#255)", () => {
  it("dates each release as its English message does", () => {
    const changelog = MESSAGES.en.content.changelog as unknown as Record<string, { released: string }>
    for (const release of CHANGELOG_RELEASES) {
      const written = new Date(`${changelog[release.key].released.replace(/^Released /, "")} UTC`)
      expect(written.toISOString().slice(0, 10), release.version).toBe(release.published)
    }
  })

  it("lists them oldest first, so the newest is last", () => {
    const dates = CHANGELOG_RELEASES.map((r) => r.published)
    expect(dates).toEqual([...dates].sort())
    expect(CHANGELOG_UPDATED).toBe(NEWEST_RELEASE.published)
  })
})

describe("noindex (#255)", () => {
  it("keeps the layout's nofollow for a language that isn't public", () => {
    expect(noindex("en")).toEqual({ index: false, follow: true })
    expect(noindex("xx")).toEqual({ index: false, follow: false })
  })
})
