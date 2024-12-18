import type { FC } from "react"
import Link from "next/link"
import homePageMetadata from "./metadata.json"
import dynamic from "next/dynamic"
import { LoadSpinner } from "@/components/LoadSpinner"
import type { FAQSectionProps } from "./FAQSection"
import Head from "next/head"

export const metadata = homePageMetadata

type LazyFAQSectionProps = Omit<FAQSectionProps, "faqs">

const FAQSection = dynamic<LazyFAQSectionProps>(
  async () => {
    const [FAQSectionModule, faqs] = await Promise.all([
      import("./FAQSection"),
      import("./faqs.json"),
    ])

    const FAQSectionComponent = FAQSectionModule.default

    const LazyFAQSection: React.FC<LazyFAQSectionProps> = (props) => {
      return <FAQSectionComponent {...props} faqs={faqs.default} />
    }

    LazyFAQSection.displayName = "LazyFAQSection"
    return LazyFAQSection
  },
  {
    loading: () => <LoadSpinner text="Loading FAQs..." />,
  }
)

const HeroSection: FC = () => {
  return (
    <div className="relative pt-14">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
      >
        <div
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
          }}
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem]
          -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#9089fc]
          opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
        />
      </div>
      <div className="py-24 sm:py-32 lg:pb-40">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-balance text-5xl font-semibold tracking-tight text-gray-900 sm:text-7xl">
              Find Pokémon Vending Machines Near You
            </h1>
            <p className="mt-8 text-pretty text-lg font-medium text-gray-500 sm:text-xl/8">
              Discover the nearest{" "}
              <strong>Pokemon Card vending machines</strong> using our
              interactive map. Find machines in stores, including{" "}
              <strong>Kroger, King Soopers, Safeway, and more</strong>, to plan
              your next stop for <strong>Pokemon card collecting</strong>.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                href="/map"
                aria-label="View the full map of Pokemon vending machines"
                className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm
                hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2
                focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                View full map
              </Link>
              <Link
                href="/blog"
                aria-label="View available articles on our blog"
                className="text-sm/6 font-semibold text-gray-900"
              >
                Learn more <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          <div className="mt-16 flow-root sm:mt-24">
            <div className="relative overflow-hidden rounded-md ring-1 ring-gray-900/10">
              <iframe
                src="/map"
                width="100%"
                height="700"
                className="w-full overflow-hidden"
                loading="lazy"
                style={{
                  borderRadius: "0.375rem",
                  boxShadow:
                    "0px 4px 6px rgba(0, 0, 0, 0.1), 0px 1px 3px rgba(0, 0, 0, 0.06)",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                }}
                title="App screenshot"
              />
            </div>
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]"
      >
        <div
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
          }}
          className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem]
          -translate-x-1/2 bg-gradient-to-tr from-[#ff80b5] to-[#9089fc]
          opacity-30 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"
        />
      </div>
    </div>
  )
}

const LandingPage: FC = () => {
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
        <HeroSection />
        <FAQSection />
      </div>
    </>
  )
}

export default LandingPage
