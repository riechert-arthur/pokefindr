import { PHASE_PRODUCTION_BUILD } from "next/constants"
import { Hero, type HeroStats } from "@/components/landing/Hero"
import { HeroMap } from "@/components/landing/HeroMap"
import { FaqSection, HowItWorks, LocationTypes } from "@/components/landing/LandingSections"
import { faqJsonLd } from "@/lib/faq"
import type { LocationKind } from "@/lib/types/locations"
import { getRegionCounts } from "@/server/services/region-counts"
import { SponsoredPlacement } from "@/components/ads/SponsoredPlacement"

// The counts change only after an import; rebuild the page at most hourly.
export const revalidate = 3600

export const metadata = {
  "title": "Find all Pokemon Vending Machine Locations - Free Map | PokeFindr",
  "description": "Find all Pokemon vending machine locations near you with PokeFindr's free map. Discover Pokemon card vending machines at Kroger, Safeway, and other stores. Plan your stops for easy TCG vending and Pokemon card collecting!",
  "keywords": [
    "Pokemon vending machines",
    "pokemon card vending machines",
    "pokemon vending machines near me",
    "pokemon vending machine locations",
    "pokemon card vending",
    "Pokemon map",
    "pokemon card vending machine near me",
    "tcg vending machine",
    "kroger pokemon vending machine",
    "pokemon vending machine colorado",
    "pokemon card collecting"
  ],
  "author": "PokeFindr Developer",
  "openGraph": {
    "title": "Find all Pokemon Vending Machine Locations | PokeFindr",
    "description": "Find all Pokemon vending machine locations near you with PokeFindr's free map. Discover Pokemon card vending machines at Kroger, Safeway, and other stores. Plan your stops for easy TCG vending and Pokemon card collecting!"
  }
}

/**
 * Live counts for the hero and the location types, from the region counts
 * view. A build (or dev) without a database renders the page without them.
 * A failure while revalidating in production throws instead, so Next keeps
 * serving the last good page rather than caching one without counts for an hour.
 */
async function landingCounts(): Promise<{ hero: HeroStats; kinds: Partial<Record<LocationKind, number>> } | null> {
  try {
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
  } catch (err) {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) throw err
    console.error("[landing] couldn't load the counts; building the page without them", err)
    return null
  }
}

const WEB_PAGE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Find Pokémon Vending Machines Near You",
  description: "Search a city to see every Pokémon card vending machine nearby on a free map.",
  url: "https://pokefindr.app/",
}

/** JSON-LD as a script tag; `<` is escaped so the data can't close the tag. */
const jsonLd = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") })

export default async function LandingPage() {
  const counts = await landingCounts()
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(WEB_PAGE_JSON_LD)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqJsonLd())} />
      <div className="isolate">
        <Hero stats={counts?.hero ?? null} background={<HeroMap />} />
        <HowItWorks />
        <SponsoredPlacement placement="landing" />
        <LocationTypes counts={counts?.kinds ?? null} />
        <FaqSection />
      </div>
    </>
  )
}
