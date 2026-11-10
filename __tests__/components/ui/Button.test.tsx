import React from "react"
import { describe, expect, it } from "vitest"
import { render, screen } from "../../helpers/intl"
import { Button } from "@/components/ui/button"

describe("Button", () => {
  it("renders a native button with custom props and classes", () => {
    render(
      <Button variant="secondary" size="lg" className="extra-class">
        Continue
      </Button>
    )

    const button = screen.getByRole("button", { name: "Continue" })
    expect(button).toHaveClass("extra-class")
    expect(button).toHaveClass("bg-secondary")
    expect(button).toHaveClass("h-10")
  })

  it("renders its child element when asChild is true", () => {
    render(
      <Button asChild>
        <a href="/settings">Settings</a>
      </Button>
    )

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings"
    )
  })
})
