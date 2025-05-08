"use client"

import type { FC } from "react"
import dynamic from "next/dynamic"
import { LoadSpinner } from "@/components/LoadSpinner"
import type { FAQSectionProps } from "./FAQSection"

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
    ssr: false,
  }
)

export const FAQLoader: FC = () => {
  return <FAQSection />
}
