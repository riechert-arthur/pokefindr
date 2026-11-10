import type { MetadataRoute } from "next"
import { getSiteUrl, PRODUCTION_URL } from "@/server/site-url"

/**
 * /robots.txt (#202): crawlers may read the pages, not the API, which is
 * where the data comes from in bulk. The Terms of Service say the same for
 * scripts and scrapers. The signed-in and admin pages aren't listed: a
 * crawler is sent to sign in there, they're left out of the sitemap, and a
 * bare prefix like /home would also match any page that starts the same way.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl() ?? new URL(PRODUCTION_URL)
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: new URL("/sitemap.xml", base).toString(),
  }
}
