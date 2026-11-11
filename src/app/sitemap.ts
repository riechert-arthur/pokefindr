import type { MetadataRoute } from "next"
import { languageAlternates, localizedPath } from "@/i18n/seo"
import { DEFAULT_LOCALE, PUBLIC_LOCALES } from "@/i18n/routing"
import { readAllBlogPostMetadata } from "@/lib/blog-utils"
import { CHANGELOG_UPDATED } from "@/lib/changelog"
import { moduleSitemapEntries } from "@/core/shell/server-slots"
import { SERVER_MODULES } from "@/modules/registry.server"
import { getSiteUrl, PRODUCTION_URL } from "@/server/site-url"

/**
 * The pages search engines should index. The signed-in pages, admin and the
 * login callbacks aren't. /login and /signup aren't listed either (#255),
 * though they aren't noindex. Never a location's page or the API: the sitemap
 * would be a list of every location (docs/scraping.md), which a test guards.
 */
export const INDEXED_PAGES = ["/", "/map", "/blog", "/changelog", "/developers", "/privacy-policy", "/terms-of-service"]

/** Pages whose content is English in every language (englishOnlyMetadata): listed once, in English. */
const ENGLISH_ONLY = new Set(["/privacy-policy", "/terms-of-service"])

/**
 * /sitemap.xml (#183): every indexed page in every public language, each
 * with the same alternates as its own hreflang (the public languages and
 * x-default). Blog posts and the legal pages are English in every
 * language, so only their English URL is listed, as their canonical says.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl() ?? new URL(PRODUCTION_URL)
  const absolute = (path: string) => new URL(path, base).toString()
  const [posts, fromModules] = await Promise.all([readAllBlogPostMetadata(), moduleSitemapEntries(SERVER_MODULES)])
  // Dates are known for the posts (their publish date; posts carry no edit date), the blog (its newest post)
  // and the changelog (its newest release), not the other pages.
  const lastModified: Record<string, string> = { "/changelog": CHANGELOG_UPDATED }
  for (const post of posts) lastModified[`/blog/${post.slug}`] = post.published
  const newestPost = posts.map((p) => p.published).sort().at(-1)
  if (newestPost) lastModified["/blog"] = newestPost
  // Pages modules contribute (`sitemap`, #324). The guard test in __tests__/i18n/seo.test.ts covers them too.
  for (const e of fromModules) if (e.lastModified) lastModified[e.path] = e.lastModified
  const pages = [...INDEXED_PAGES, ...fromModules.filter((e) => !e.englishOnly).map((e) => e.path)]
  const englishPages = [...posts.map((p) => `/blog/${p.slug}`), ...INDEXED_PAGES.filter((path) => ENGLISH_ONLY.has(path)), ...fromModules.filter((e) => e.englishOnly).map((e) => e.path)]
  const dated = (path: string) => (lastModified[path] ? { lastModified: lastModified[path] } : {})
  const englishOnly = englishPages.map((path) => ({
    url: absolute(localizedPath(path, DEFAULT_LOCALE)),
    ...dated(path),
  }))
  const translated = pages.filter((path) => !ENGLISH_ONLY.has(path)).flatMap((path) =>
    PUBLIC_LOCALES.map((locale) => ({
      url: absolute(localizedPath(path, locale)),
      ...dated(path),
      ...(PUBLIC_LOCALES.length > 1 && { alternates: { languages: languageAlternates(path, absolute) } }),
    })),
  )
  return [...translated, ...englishOnly]
}
