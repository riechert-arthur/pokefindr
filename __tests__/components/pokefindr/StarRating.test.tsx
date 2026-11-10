import React from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "../../helpers/intl"
import { StarRating } from "@/components/pokefindr/StarRating"

describe("StarRating", () => {
  it("renders a read-only rating as a labelled image", () => {
    render(<StarRating rating={3.5} />)
    expect(screen.getByRole("img", { name: "3.5 out of 5 stars" })).toBeInTheDocument()
    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(screen.queryAllByRole("radio")).toHaveLength(0)
  })

  it("draws a half star as a filled half over an outline", () => {
    const { container } = render(<StarRating rating={3.5} />)
    const halves = container.querySelectorAll("svg.lucide-star-half")
    expect(halves).toHaveLength(1)
    const half = halves[0]
    expect(half.getAttribute("fill")).toBe("currentColor")
    // The outline star comes first, so the filled half is drawn on top of it.
    const outline = half.previousElementSibling!
    expect(outline.matches("svg.lucide-star")).toBe(true)
    expect(outline.getAttribute("fill")).toBe("none")
    expect(container.querySelectorAll('svg.lucide-star[fill="currentColor"]')).toHaveLength(3)
  })

  it("is a radio group with one checked star and one tab stop", () => {
    render(<StarRating rating={2} onChange={() => {}} />)
    expect(screen.getByRole("radiogroup", { name: "Rating" })).toBeInTheDocument()
    const radios = screen.getAllByRole("radio")
    expect(radios).toHaveLength(5)
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false", "false", "false"])
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1, -1])
  })

  it("calls onChange on click", () => {
    const onChange = vi.fn()
    render(<StarRating rating={2} onChange={onChange} />)
    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it("moves with arrow keys, Home and End, within 1–5", () => {
    const onChange = vi.fn()
    render(<StarRating rating={5} onChange={onChange} />)
    const group = screen.getByRole("radiogroup")
    fireEvent.keyDown(group, { key: "ArrowLeft" })
    fireEvent.keyDown(group, { key: "ArrowRight" })
    fireEvent.keyDown(group, { key: "Home" })
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([4, 5, 1])
  })

  it("puts the first star in the tab order when nothing is selected", () => {
    render(<StarRating rating={0} onChange={() => {}} />)
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([0, -1, -1, -1, -1])
  })

  it("passes form props such as aria-describedby to the group", () => {
    render(<StarRating rating={1} onChange={() => {}} id="r" aria-describedby="r-msg" aria-invalid />)
    const group = screen.getByRole("radiogroup")
    expect(group).toHaveAttribute("id", "r")
    expect(group).toHaveAttribute("aria-describedby", "r-msg")
    expect(group).toHaveAttribute("aria-invalid", "true")
  })

  it("uses the spark token for filled stars and border for empty ones", () => {
    const { container } = render(<StarRating rating={2} />)
    const svgs = [...container.querySelectorAll("svg")]
    expect(svgs.filter((s) => s.classList.contains("text-spark"))).toHaveLength(2)
    expect(svgs.filter((s) => s.classList.contains("text-border"))).toHaveLength(3)
  })

  it("takes an accessible name for the input", () => {
    render(<StarRating rating={2} onChange={() => {}} label="Your rating" />)
    expect(screen.getByRole("radiogroup", { name: "Your rating" })).toBeInTheDocument()
  })

  it("draws and reads an average at the same half-star step", () => {
    const { container, rerender } = render(<StarRating rating={13 / 3} />)
    expect(screen.getByRole("img", { name: "4.5 out of 5 stars" })).toBeInTheDocument()
    expect(container.querySelectorAll("svg.lucide-star-half")).toHaveLength(1)
    rerender(<StarRating rating={4.96} />)
    expect(screen.getByRole("img", { name: "5 out of 5 stars" })).toBeInTheDocument()
    expect(container.querySelectorAll("svg.lucide-star-half")).toHaveLength(0)
  })

  it("labels bad or out-of-range ratings sensibly", () => {
    const { rerender } = render(<StarRating rating={Number.NaN} />)
    expect(screen.getByRole("img", { name: "0 out of 5 stars" })).toBeInTheDocument()
    rerender(<StarRating rating={5.3} />)
    expect(screen.getByRole("img", { name: "5 out of 5 stars" })).toBeInTheDocument()
  })

  it("draws the selected whole star in input mode", () => {
    const { container } = render(<StarRating rating={3.5} onChange={() => {}} />)
    expect(screen.getByRole("radio", { name: "4 stars" })).toHaveAttribute("aria-checked", "true")
    expect(container.querySelectorAll("svg.lucide-star-half")).toHaveLength(0)
    expect(container.querySelectorAll('svg.lucide-star[fill="currentColor"]')).toHaveLength(4)
  })
})
