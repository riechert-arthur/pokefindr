import faqs from "@/data/faqs.json"

export interface Faq {
  id: number
  question: string
  /** Plain text; `[text](https://…)` makes a link. */
  answer: string
}

export const FAQS: readonly Faq[] = faqs

/** Splits an answer into text and links, so it renders without raw HTML. */
export function answerParts(answer: string): ({ text: string } | { text: string; href: string })[] {
  const parts: ({ text: string } | { text: string; href: string })[] = []
  const link = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  let at = 0
  for (const m of answer.matchAll(link)) {
    if (m.index > at) parts.push({ text: answer.slice(at, m.index) })
    parts.push({ text: m[1], href: m[2] })
    at = m.index + m[0].length
  }
  if (at < answer.length) parts.push({ text: answer.slice(at) })
  return parts
}

/** An answer as plain text (links become their text), for structured data. */
export const answerText = (answer: string) => answerParts(answer).map((p) => p.text).join("")

/** schema.org FAQPage for the landing page's FAQ, so search results can show it. */
export function faqJsonLd(faqs: readonly Faq[] = FAQS) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: answerText(f.answer) },
    })),
  }
}
