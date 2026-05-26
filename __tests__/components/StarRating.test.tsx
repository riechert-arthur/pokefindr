import React from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { StarRating } from "@/components/ui/StarRating"

describe("StarRating", () => {
  it("renders a readonly five-star rating", () => {
    const { container } = render(<StarRating rating={3.5} />)

    expect(container.querySelectorAll("span")).toHaveLength(5)
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })

  it("calls onChange with the selected star value", () => {
    const onChange = vi.fn()
    render(<StarRating rating={2} onChange={onChange} />)

    const buttons = screen.getAllByRole("button")
    expect(buttons).toHaveLength(5)

    fireEvent.click(buttons[3])
    expect(onChange).toHaveBeenCalledWith(4)
  })
})
