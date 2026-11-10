// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

// As once Spanish is public (#186).
vi.mock("@/i18n/routing", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/routing")>()), PUBLIC_LOCALES: ["en", "es"] }))
vi.mock("@/lib/blog-utils", () => ({ readAllBlogPostMetadata: async () => [{ slug: "first-post" }] }))

import { englishOnlyMetadata, pageMetadata } from "@/i18n/seo"
import sitemap, { INDEXED_PAGES } from "@/app/sitemap"

describe("each language's address for search engines (#183)", () => {
  const esCard = { url: "/es/social-card", width: 1200, height: 630, type: "image/png", alt: "PokeFindr: encuentra máquinas expendedoras de cartas Pokémon cerca de ti" }

  it("names the page in every public language, English as x-default, with og:locale and the preview in its language", async () => {
    const meta = await pageMetadata("/map", "es", { title: "Mapa", openGraph: { title: "Mapa" } })
    expect(meta.title).toBe("Mapa")
    expect(meta.alternates).toEqual({ canonical: "/es/map", languages: { en: "/map", es: "/es/map", "x-default": "/map" } })
    expect(meta.openGraph).toEqual({ url: "/es/map", locale: "es_US", alternateLocale: ["en_US"], images: [esCard], title: "Mapa" })
    expect(meta.twitter).toEqual({ card: "summary_large_image", images: [esCard] })
    expect((await pageMetadata("/", "en")).alternates).toEqual({ canonical: "/", languages: { en: "/", es: "/es", "x-default": "/" } })
  })

  it("points English-only content at the English page", async () => {
    expect((await englishOnlyMetadata("/privacy-policy")).alternates).toEqual({ canonical: "/privacy-policy" })
  })

  it("lists every indexed page in every public language, with the same alternates as its hreflang", async () => {
    const entries = await sitemap()
    // The two legal pages and the one post are English everywhere: listed once.
    expect(entries).toHaveLength((INDEXED_PAGES.length - 2) * 2 + 2 + 1)
    expect(entries).toContainEqual({
      url: "https://pokefindr.app/es/map",
      alternates: { languages: { en: "https://pokefindr.app/map", es: "https://pokefindr.app/es/map", "x-default": "https://pokefindr.app/map" } },
    })
    expect(entries).toContainEqual({ url: "https://pokefindr.app/blog/first-post" })
    expect(entries).toContainEqual({ url: "https://pokefindr.app/privacy-policy" })
    expect(entries.map((e) => e.url).filter((u) => /\/es\/(blog\/|privacy|terms)/.test(u))).toEqual([])
    expect(entries.map((e) => e.url).filter((u) => /\/(home|settings|admin)/.test(u))).toEqual([])
  })
})
