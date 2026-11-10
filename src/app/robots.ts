import type { MetadataRoute } from "next"
import { localizedPath } from "@/i18n/seo"
import { LOCALES } from "@/i18n/routing"
import { getSiteUrl, PRODUCTION_URL } from "@/server/site-url"

/** Signed-in and admin pages, in every language: nothing there to index (the sitemap leaves them out too). */
const PRIVATE_PAGES = ["/home", "/settings", "/admin"]

/**
 * /robots.txt (#202): crawlers may read the pages, not the API, which is
 * where the data comes from in bulk. The Terms of Service say the same for
 * scripts and scrapers.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl() ?? new URL(PRODUCTION_URL)
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...PRIVATE_PAGES.flatMap((path) => LOCALES.map((locale) => localizedPath(path, locale)))],
    },
    sitemap: new URL("/sitemap.xml", base).toString(),
  }
}
