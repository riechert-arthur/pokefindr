import type { MetadataRoute } from "next"
import { localizedPath } from "@/i18n/seo"
import { PUBLIC_LOCALES } from "@/i18n/routing"
import { readAllBlogPostMetadata } from "@/lib/blog-utils"
import { getSiteUrl, PRODUCTION_URL } from "@/server/site-url"

/** The pages search engines should index. The signed-in pages, admin and the login callbacks aren't. */
export const INDEXED_PAGES = ["/", "/map", "/blog", "/changelog", "/developers", "/login", "/signup", "/privacy-policy", "/terms-of-service"]

/**
 * /sitemap.xml (#183): every indexed page in every public language, each
 * with its other languages as alternates, and the blog posts.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl() ?? new URL(PRODUCTION_URL)
  const absolute = (path: string) => new URL(path, base).toString()
  const posts = (await readAllBlogPostMetadata()).map((p) => `/blog/${p.slug}`)
  return [...INDEXED_PAGES, ...posts].flatMap((path) =>
    PUBLIC_LOCALES.map((locale) => ({
      url: absolute(localizedPath(path, locale)),
      ...(PUBLIC_LOCALES.length > 1 && {
        alternates: { languages: Object.fromEntries(PUBLIC_LOCALES.map((l) => [l, absolute(localizedPath(path, l))])) },
      }),
    })),
  )
}
