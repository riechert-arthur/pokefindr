import React from "react"
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
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
    expect(container.querySelector("img")).toHaveAttribute("src", "/blog/hero.png")
  })
})
