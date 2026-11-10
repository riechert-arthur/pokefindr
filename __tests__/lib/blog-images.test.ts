// @vitest-environment node
import { describe, expect, it } from "vitest"
import config from "../../next.config"
import { readAllBlogPostMetadata } from "@/lib/blog-utils"

describe("blog hero images (#298)", () => {
  it("come from a host next/image may resize", async () => {
    const patterns = config("phase-test").images?.remotePatterns ?? []
    const allowed = (src: string) => {
      const url = new URL(src)
      return patterns.some((p) => !(p instanceof URL) && url.protocol === `${p.protocol}:` && url.hostname === p.hostname && (!p.pathname || url.pathname === p.pathname))
    }
    for (const post of await readAllBlogPostMetadata()) expect(allowed(post.heroImageURL), post.heroImageURL).toBe(true)
  })
})
