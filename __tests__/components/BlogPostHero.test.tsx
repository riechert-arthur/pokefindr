import React from "react"
import { describe, expect, it } from "vitest"
import { render, screen } from "../helpers/intl"
import { BlogPostHero } from "@/components/BlogPostHero"

describe("BlogPostHero", () => {
  it("renders the post title, description, and hero image", () => {
    const { container } = render(
      <BlogPostHero
        metadata={{
          title: "Best Pokemon vending machine stops",
          description: "A guide to finding nearby Pokemon Center machines.",
          heroImageURL: "/blog/hero.png",
          published: "true",
          date: "2026-05-01",
          slug: "pokemon-vending-machines",
          link: "/blog/pokemon-vending-machines",
        }}
      />
    )

    expect(
      screen.getByRole("heading", {
        name: "Best Pokemon vending machine stops",
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText("A guide to finding nearby Pokemon Center machines.")
    ).toBeInTheDocument()
    // Through next/image, resized and loaded first (#298).
    const img = container.querySelector("img")
    expect(img?.getAttribute("src")).toContain(encodeURIComponent("/blog/hero.png"))
    expect(img).not.toHaveAttribute("loading", "lazy")
  })
})
