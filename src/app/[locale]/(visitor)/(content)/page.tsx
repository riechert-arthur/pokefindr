import { PHASE_PRODUCTION_BUILD } from "next/constants"
import { Hero, type HeroStats } from "@/components/landing/Hero"
import { HeroMap } from "@/components/landing/HeroMap"
import { FaqSection, HowItWorks, LocationTypes } from "@/components/landing/LandingSections"
import { faqJsonLd } from "@/lib/faq"
import type { LocationKind } from "@/lib/types/locations"
import { getRegionCounts } from "@/server/services/region-counts"
import { getVendingCells, VENDING_CELL_DEG } from "@/server/services/locations"
import { SponsoredPlacement } from "@/components/ads/SponsoredPlacement"
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

/** JSON-LD as a script tag; `<` is escaped so the data can't close the tag. */
const jsonLd = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") })

export default async function LandingPage({ params }: LocaleParams) {
  const locale = await setPageLocale(params)
  const [counts, cells, t, faq] = await Promise.all([
    landingCounts(),
    // The background map's machines, per grid cell: rendered in, so there's no endpoint to scrape.
    orNullWithoutDb("map cells", () => getVendingCells()),
    getTranslations({ locale, namespace: "landing.meta" }),
    getTranslations({ locale, namespace: "faq" }),
  ])
  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t("pageName"),
    description: t("pageDescription"),
    url: new URL(getPathname({ href: "/", locale }), PRODUCTION_URL).toString(),
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(webPage)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqJsonLd(faq))} />
      <div className="isolate">
        <Hero stats={counts?.hero ?? null} background={<HeroMap cells={cells ?? []} cellSize={VENDING_CELL_DEG} />} />
        <HowItWorks />
        <SponsoredPlacement placement="landing" />
        <LocationTypes counts={counts?.kinds ?? null} />
        <FaqSection />
      </div>
    </>
  )
}
