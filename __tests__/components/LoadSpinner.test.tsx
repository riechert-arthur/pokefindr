import { describe, expect, it } from "vitest"
import { render, screen } from "../helpers/intl"
import { LoadSpinner } from "@/components/wrappers/LoadSpinner"

describe("LoadSpinner", () => {
  it("fills the screen on a page of its own, and only its place inside the app layout", () => {
    const { rerender } = render(<LoadSpinner text="Logging you in..." />)
    expect(screen.getByRole("heading").parentElement).toHaveClass("h-screen", "w-screen")
    rerender(<LoadSpinner text="Loading settings..." fullScreen={false} />)
    expect(screen.getByRole("heading").parentElement).toHaveClass("h-full", "w-full")
    expect(screen.getByRole("heading").parentElement).not.toHaveClass("h-screen")
  })
})
