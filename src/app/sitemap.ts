import type { MetadataRoute } from "next"
import { languageAlternates, localizedPath } from "@/i18n/seo"
import { DEFAULT_LOCALE, PUBLIC_LOCALES } from "@/i18n/routing"
import { readAllBlogPostMetadata } from "@/lib/blog-utils"
import { getSiteUrl, PRODUCTION_URL } from "@/server/site-url"

/** The pages search engines should index. The signed-in pages, admin and the login callbacks aren't. */
export const INDEXED_PAGES = ["/", "/map", "/blog", "/changelog", "/developers", "/login", "/signup", "/privacy-policy", "/terms-of-service"]

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
  const posts = (await readAllBlogPostMetadata()).map((p) => `/blog/${p.slug}`)
  const englishOnly = [...posts, ...INDEXED_PAGES.filter((path) => ENGLISH_ONLY.has(path))].map((path) => ({ url: absolute(localizedPath(path, DEFAULT_LOCALE)) }))
  const translated = INDEXED_PAGES.filter((path) => !ENGLISH_ONLY.has(path)).flatMap((path) =>
    PUBLIC_LOCALES.map((locale) => ({
      url: absolute(localizedPath(path, locale)),
      ...(PUBLIC_LOCALES.length > 1 && { alternates: { languages: languageAlternates(path, absolute) } }),
    })),
  )
  return [...translated, ...englishOnly]
}
