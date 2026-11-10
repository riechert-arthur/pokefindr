import { describe, expect, it } from "vitest"
import { createTranslator } from "next-intl"
import { FAQ_IDS, faqAnswerText, faqJsonLd, type FaqMessages } from "@/lib/faq"
import { MESSAGES, message } from "../helpers/intl"
import type { Locale } from "@/i18n/routing"

const faq = (locale: Locale) => createTranslator({ locale, messages: MESSAGES[locale], namespace: "faq" }) as unknown as FaqMessages

describe("FAQ", () => {
  it("makes answers plain text, links becoming their text", () => {
    expect(faqAnswerText(faq("en"), "verified")).toBe("Yes. Locations come from the official retailer list on the Pokémon Center website.")
  })

  it("builds FAQPage data with plain-text answers", () => {
    const ld = faqJsonLd(faq("en"))
    expect(ld["@type"]).toBe("FAQPage")
    expect(ld.mainEntity).toHaveLength(FAQ_IDS.length)
    expect(ld.mainEntity[0].name).toBe(message()("faq.items.what.question"))
    for (const q of ld.mainEntity) expect(q.acceptedAnswer.text).not.toMatch(/<|\]\(/)
  })

  it("builds the FAQPage data in the page's language", () => {
    const ld = faqJsonLd(faq("es"))
    expect(ld.mainEntity[0].name).toBe("¿Qué es una máquina expendedora de Pokémon?")
    expect(ld.mainEntity[2].acceptedAnswer.text).toBe(faqAnswerText(faq("es"), "verified"))
    expect(ld.mainEntity[2].acceptedAnswer.text).toContain("sitio web del Pokémon Center")
  })
})
