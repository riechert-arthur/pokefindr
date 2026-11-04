import React from "react"
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import FAQSection from "@/components/FAQSection"

describe("FAQSection", () => {
  it("renders all FAQ questions and HTML answers", () => {
    render(
      <FAQSection
        faqs={[
          {
            id: 1,
            question: "Where do locations come from?",
            answer: "They are sourced from <strong>Pokemon Center</strong>.",
          },
          {
            id: 2,
            question: "Can I suggest edits?",
            answer: "Yes, submit a review from a location page.",
          },
        ]}
      />
    )

    expect(
      screen.getByRole("heading", { name: "Frequently asked questions" })
    ).toBeInTheDocument()
    expect(screen.getByText("Where do locations come from?")).toBeInTheDocument()
    expect(screen.getByText("Can I suggest edits?")).toBeInTheDocument()
    expect(screen.getByText("Pokemon Center").tagName).toBe("STRONG")
  })
})
