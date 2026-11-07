import Head from "next/head"
import { PHASE_PRODUCTION_BUILD } from "next/constants"
import { FAQLoader } from "@/components/wrappers/FAQLoader"
import { Hero, type HeroStats } from "@/components/landing/Hero"
import { HeroMap } from "@/components/landing/HeroMap"
import { getRegionCounts } from "@/server/services/region-counts"

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
 * Live counts for the hero, from the region counts view. A build (or dev)
 * without a database renders the hero without them. A failure while
 * revalidating in production throws instead, so Next keeps serving the last
 * good page rather than caching one without stats for an hour.
 */
async function heroStats(): Promise<HeroStats | null> {
  try {
    const counts = await getRegionCounts()
    const vending = counts.filter((c) => c.country === "US" && c.kind === "vending")
    return {
      vending: vending.reduce((n, c) => n + c.count, 0),
      states: new Set(vending.filter((c) => c.region && c.count > 0).map((c) => c.region)).size,
    }
  } catch (err) {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) throw err
    console.error("[landing] couldn't load the counts; building the page without them", err)
    return null
  }
}

const LandingPage = async () => {
  const stats = await heroStats()
  return (
    <>
      <Head>
        <script
          id="webpage-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              name: "Find Pokemon Vending Machines Near You",
              description:
                "View our interactive map to locate Pokemon Card vending machines.",
              url: "https://pokefindr.app/map",
            }),
          }}
        />
        <script
          id="faq-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "How do I find a Pokemon vending machine?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Use our interactive map to find the nearest Pokemon vending machines near you.",
                  },
                },
              ],
            }),
          }}
        />
      </Head>
      <div className="isolate">
        <Hero stats={stats} background={<HeroMap />} />
        <FAQLoader />
      </div>
    </>
  )
}

export default LandingPage
