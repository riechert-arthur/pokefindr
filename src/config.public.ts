/**
 * Browser-safe configuration. Only `NEXT_PUBLIC_*` values belong here.
 *
 * Each variable must be referenced literally (`process.env.NEXT_PUBLIC_X`)
 * so Next.js can inline it into the client bundle at build time.
 */
/** Where analytics events go (#53). */
export const ANALYTICS_PROVIDERS = ["none", "vercel", "plausible", "umami"] as const
export type AnalyticsProvider = (typeof ANALYTICS_PROVIDERS)[number]

/** The configured provider; anything unset or unknown is "none", so local dev and CI send nothing. */
export function analyticsProviderOf(value: string | undefined): AnalyticsProvider {
  const v = value?.trim().toLowerCase()
  return (ANALYTICS_PROVIDERS as readonly string[]).includes(v ?? "") ? (v as AnalyticsProvider) : "none"
}

export const publicConfig = {
  analytics: {
    provider: analyticsProviderOf(process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER),
    /** Plausible: the site's domain. Umami: the website id. */
    site: process.env.NEXT_PUBLIC_ANALYTICS_SITE,
    /** Plausible or Umami self-hosted: the tracker script's URL. Defaults to their cloud. */
    scriptUrl: process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT_URL,
  },
  /** The first sponsored banner's link, impression pixel and image (src/config/banners.ts). Undefined when unset: it doesn't show. */
  sponsor: {
    link: process.env.NEXT_PUBLIC_AFFILIATE_LINK_1,
    pixel: process.env.NEXT_PUBLIC_PIXEL_TRACKING_URL_1,
    image: process.env.NEXT_PUBLIC_IMAGE_1,
  },
} as const
