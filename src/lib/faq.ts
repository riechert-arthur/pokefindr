import type { ReactNode } from "react"
import type { useTranslations } from "next-intl"

/** The FAQ's questions, in order. Each one's question and answer are in the catalog (`faq.items.<id>`). */
export const FAQ_IDS = ["what", "map", "verified", "info", "filter", "add", "report", "account", "countries", "official"] as const
export type FaqId = (typeof FAQ_IDS)[number]

/** Where the tags in the answers link: `<center>` and `<support>`. */
export const FAQ_LINKS = {
  center: "https://support.pokemoncenter.com/hc/en-us/sections/13360842288916-Pok%C3%A9mon-Automated-Retail-Vending-Machines",
  support: "https://discord.gg/f2uUR5bAZU",
} as const

export type FaqTag = keyof typeof FAQ_LINKS

/** The "faq" messages, from useTranslations("faq") or getTranslations("faq"). */
export type FaqMessages = ReturnType<typeof useTranslations<"faq">>

/** An answer as rich text, each link made by `link(tag, chunks)`. */
export function faqAnswer(t: FaqMessages, id: FaqId, link: (tag: FaqTag, chunks: ReactNode) => ReactNode): ReactNode {
  return t.rich(`items.${id}.answer`, {
    center: (chunks) => link("center", chunks),
    support: (chunks) => link("support", chunks),
  })
}

/** An answer as plain text (links become their text), for structured data. */
export function faqAnswerText(t: FaqMessages, id: FaqId): string {
  return t.markup(`items.${id}.answer`, { center: (chunks) => chunks, support: (chunks) => chunks })
}

/** schema.org FAQPage for the landing page's FAQ, in the page's language, so search results can show it. */
export function faqJsonLd(t: FaqMessages) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_IDS.map((id) => ({
      "@type": "Question",
      name: t(`items.${id}.question`),
      acceptedAnswer: { "@type": "Answer", text: faqAnswerText(t, id) },
    })),
  }
}
