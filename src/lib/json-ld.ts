import { SUPPORT_URL } from "@/lib/links"

/**
 * Structured data (schema.org JSON-LD) for search results (#255). It
 * describes the site, its pages and its posts, never locations: a JSON-LD
 * list of places would be the complete, scrapable list R10 keeps out of the
 * pages (docs/scraping.md).
 */

/** JSON-LD for a `<script type="application/ld+json">`; `<` is escaped so the data can't close the tag. */
export const jsonLd = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") })

const SITE_NAME = "PokeFindr"

/** schema.org ids, so the page, the site and the organization can point at each other. */
const organizationId = (site: string) => new URL("/#organization", site).toString()
const websiteId = (site: string) => new URL("/#website", site).toString()

/** The organization behind the site, with its logo (the generated 180 px icon) and the Discord. */
export function organizationJsonLd(site: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId(site),
    name: SITE_NAME,
    url: new URL("/", site).toString(),
    logo: new URL("/apple-icon", site).toString(),
    sameAs: [SUPPORT_URL],
  }
}

/** The site in a language (`url` is its home page there). No SearchAction: the map's search isn't a results page. */
export function websiteJsonLd(site: string, { url, language }: { url: string; language: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": websiteId(site),
    name: SITE_NAME,
    url,
    inLanguage: language,
    publisher: { "@id": organizationId(site) },
  }
}

export interface BlogPostingInput {
  title: string
  description: string
  /** yyyy-mm-dd */
  published: string
  heroImageURL?: string
  /** The post's absolute canonical URL. */
  url: string
}

/** A blog post, published by PokeFindr. */
export function blogPostingJsonLd(site: string, post: BlogPostingInput) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.published,
    ...(post.heroImageURL && { image: [post.heroImageURL] }),
    url: post.url,
    mainEntityOfPage: post.url,
    inLanguage: "en",
    author: { "@type": "Organization", name: SITE_NAME, url: new URL("/", site).toString() },
    // In full, not by @id: the organization's own JSON-LD is on the landing page, not here.
    publisher: { "@type": "Organization", name: SITE_NAME, url: new URL("/", site).toString(), logo: new URL("/apple-icon", site).toString() },
  }
}
