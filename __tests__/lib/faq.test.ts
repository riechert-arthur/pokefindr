import { describe, expect, it } from "vitest"
import { FAQS, answerParts, answerText, faqJsonLd } from "@/lib/faq"

describe("FAQ", () => {
  it("splits answers into text and links", () => {
    expect(answerParts("See the [Pokémon Center website](https://example.com/a?b=1). Thanks.")).toEqual([
      { text: "See the " },
      { text: "Pokémon Center website", href: "https://example.com/a?b=1" },
      { text: ". Thanks." },
    ])
    expect(answerParts("No links.")).toEqual([{ text: "No links." }])
    // Only http(s) links; anything else stays text.
    expect(answerParts("[x](javascript:alert(1))")).toEqual([{ text: "[x](javascript:alert(1))" }])
  })

  it("has no raw HTML and builds FAQPage data with plain-text answers", () => {
    expect(FAQS.every((f) => !/<[a-z]/i.test(f.answer))).toBe(true)
    const ld = faqJsonLd()
    expect(ld["@type"]).toBe("FAQPage")
    expect(ld.mainEntity).toHaveLength(FAQS.length)
    expect(ld.mainEntity[2].acceptedAnswer.text).toBe(answerText(FAQS[2].answer))
    expect(ld.mainEntity[2].acceptedAnswer.text).not.toContain("](")
  })
})
