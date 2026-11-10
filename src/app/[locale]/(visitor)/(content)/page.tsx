import { PHASE_PRODUCTION_BUILD } from "next/constants"
import { unstable_cache } from "next/cache"
import { Hero, type HeroStats } from "@/components/landing/Hero"
import { HeroMap } from "@/components/landing/HeroMap"
import { FaqSection, HowItWorks, LocationTypes } from "@/components/landing/LandingSections"
import { faqJsonLd } from "@/lib/faq"
import { jsonLd, organizationJsonLd, websiteId, websiteJsonLd } from "@/lib/json-ld"
import { PUBLIC_LOCALES } from "@/i18n/routing"
import type { LocationKind } from "@/lib/types/locations"
import { getRegionCounts } from "@/server/services/region-counts"
import { getVendingCells, VENDING_CELL_DEG } from "@/server/services/locations"
import { SponsoredPlacement } from "@/components/ads/SponsoredPlacement"
import { bannersFor } from "@/config/banners"
import { AD_PLACEMENTS_TAG, readPlacementFlags } from "@/server/services/ad-placements"
import { setPageLocale, type LocaleParams } from "@/i18n/static"
import type { Locale } from "@/i18n/routing"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { pageMetadata } from "@/i18n/seo"
import { getPathname } from "@/i18n/navigation"
import { PRODUCTION_URL } from "@/server/site-url"

// The counts change only after an import; rebuild the page at most hourly.
export const revalidate = 3600

/** The page's title, description, keywords and Open Graph, in its language. */
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: locale as Locale, namespace: "landing.meta" })
  return pageMetadata("/", locale as Locale, {
    title: t("title"),
    description: t("description"),
    keywords: t("keywords").split(/,\s*/),
    openGraph: { title: t("ogTitle"), description: t("description") },
  })
}

/**
 * `load()`, or null for a build (or dev) without a database, which renders
 * the page without that part. A failure while revalidating in production
 * throws instead, so Next keeps serving the last good page rather than
 * caching one without it for an hour.
 */
async function orNullWithoutDb<T>(what: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load()
  } catch (err) {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) throw err
    console.error(`[landing] couldn't load the ${what}; building the page without them`, err)
    return null
  }
}

/** Live counts for the hero and the location types, from the region counts view. */
function landingCounts(): Promise<{ hero: HeroStats; kinds: Partial<Record<LocationKind, number>> } | null> {
  return orNullWithoutDb("counts", async () => {
    const counts = (await getRegionCounts()).filter((c) => c.country === "US")
    const kinds: Partial<Record<LocationKind, number>> = {}
    for (const c of counts) kinds[c.kind] = (kinds[c.kind] ?? 0) + c.count
    return {
      hero: {
        vending: kinds.vending ?? 0,
        states: new Set(counts.filter((c) => c.kind === "vending" && c.region && c.count > 0).map((c) => c.region)).size,
      },
      kinds,
    }
  })
}

/**
 * The sponsored switches, kept as long as the page (getPlacementFlags' 5
 * minutes would rebuild it 12 times as often). An admin's switch clears the
 * tag, which rebuilds this page too.
 */
const adFlags = unstable_cache(() => readPlacementFlags(), ["landing-ad-placements"], { tags: [AD_PLACEMENTS_TAG], revalidate: 3600 })

/** The cells don't depend on the language: one query an hour for every locale's page. */
const vendingCells = unstable_cache(() => getVendingCells(), ["landing-vending-cells"], { revalidate: 3600 })

export default async function LandingPage({ params }: LocaleParams) {
  const locale = await setPageLocale(params)
  const [counts, cells, ads, t, faq] = await Promise.all([
    landingCounts(),
    // The background map's machines, per grid cell: rendered in, so there's no endpoint to scrape.
    orNullWithoutDb("map cells", () => vendingCells()),
    // Whether the sponsored strip is on, so its space is kept from the first paint (#298).
    // Optional: if it can't be read, the strip just isn't reserved (rather than the page failing to rebuild).
    adFlags().catch((err: unknown) => {
      console.error("[landing] couldn't read the ad placements; not reserving the strip", err)
      return null
    }),
    getTranslations({ locale, namespace: "landing.meta" }),
    getTranslations({ locale, namespace: "faq" }),
  ])
  const url = new URL(getPathname({ href: "/", locale }), PRODUCTION_URL).toString()
  // The site, who runs it, this page and its FAQ. Nothing about locations (src/lib/json-ld.ts).
  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t("pageName"),
    description: t("pageDescription"),
    url,
    inLanguage: locale,
    isPartOf: { "@id": websiteId(PRODUCTION_URL) },
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(organizationJsonLd(PRODUCTION_URL))} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(websiteJsonLd(PRODUCTION_URL, PUBLIC_LOCALES))} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(webPage)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqJsonLd(faq))} />
      <div className="isolate">
        <Hero stats={counts?.hero ?? null} background={<HeroMap cells={cells ?? []} cellSize={VENDING_CELL_DEG} />} />
        <HowItWorks />
        <SponsoredPlacement placement="landing" reserve={ads?.landing === true && bannersFor("landing").length > 0} />
        <LocationTypes counts={counts?.kinds ?? null} />
        <FaqSection />
      </div>
    </>
  )
}
