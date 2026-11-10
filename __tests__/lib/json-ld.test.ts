// @vitest-environment node
import { describe, expect, it } from "vitest"
import { blogPostingJsonLd, jsonLd, organizationJsonLd, websiteJsonLd } from "@/lib/json-ld"
import { readAllBlogPostMetadata } from "@/lib/blog-utils"

const SITE = "https://pokefindr.app"

describe("structured data (#255)", () => {
  it("escapes < so the data can't close its script tag", () => {
    expect(jsonLd({ name: "</script><script>alert(1)</script>" }).__html).not.toContain("<")
  })

  it("describes the site and its organization", () => {
    expect(organizationJsonLd(SITE)).toMatchObject({ "@type": "Organization", "@id": `${SITE}/#organization`, name: "PokeFindr", url: `${SITE}/`, logo: `${SITE}/apple-icon` })
    // One node for every language: same @id, same url.
    expect(websiteJsonLd(SITE, ["en", "es"])).toMatchObject({
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: `${SITE}/`,
      inLanguage: ["en", "es"],
      publisher: { "@id": `${SITE}/#organization` },
    })
  })

  it("gives every post a BlogPosting with an ISO publish date", async () => {
    const posts = await readAllBlogPostMetadata()
    expect(posts.length).toBeGreaterThan(0)
    for (const post of posts) {
      const data = blogPostingJsonLd(SITE, { ...post, url: `${SITE}/blog/${post.slug}` })
      expect(data).toMatchObject({ "@type": "BlogPosting", headline: post.title, mainEntityOfPage: `${SITE}/blog/${post.slug}` })
      // The sitemap's lastModified and the list's <time dateTime> need yyyy-mm-dd.
      expect(post.published).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
