import { describe, expect, it } from "vitest"
import { websiteLink } from "@/lib/locations/website"

describe("websiteLink (#399)", () => {
  it.each([
    ["https://www.daveandadams.com/", "https://www.daveandadams.com/", "daveandadams.com"],
    ["http://shop.example/cards/", "http://shop.example/cards/", "shop.example/cards"],
    [" https://example.com/a?b=1 ", "https://example.com/a?b=1", "example.com/a"],
  ])("links %s, labeled without its scheme, www or trailing slash", (url, href, label) => {
    expect(websiteLink(url)).toEqual({ href, label })
  })

  it.each(["javascript:alert(1)", "data:text/html,hi", "mailto:a@b.c", "ftp://example.com", "not a url", "", null, undefined])("never links %s", (url) => {
    expect(websiteLink(url)).toBeNull()
  })
})
