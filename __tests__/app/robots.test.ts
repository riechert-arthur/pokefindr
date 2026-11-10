// @vitest-environment node
import { describe, expect, it } from "vitest"
import robots from "@/app/robots"

describe("robots.txt (#202)", () => {
  it("allows the pages, keeps crawlers out of the API and the signed-in pages, and points to the sitemap", () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/home", "/es/home", "/settings", "/es/settings", "/admin", "/es/admin"],
      },
      sitemap: "https://pokefindr.app/sitemap.xml",
    })
  })
})
