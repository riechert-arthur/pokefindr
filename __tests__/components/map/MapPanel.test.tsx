import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "../../helpers/intl"
import { MapPanel } from "@/components/map/MapPanel"

describe("MapPanel", () => {
  const renderPanel = (kinds: ("vending" | "shop" | "event")[]) => {
    const onKindsChange = vi.fn()
    render(<MapPanel search={<input aria-label="Search" />} kinds={kinds} onKindsChange={onKindsChange} sheet={<p>Results</p>} sheetLabel="Results" />)
    return onKindsChange
  }

  it("shows a chip per kind, with no count (#403), and the sheet", () => {
    renderPanel(["vending", "shop", "event"])
    expect(screen.getByRole("button", { name: "Vending" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Shops" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Results" })).toHaveTextContent("Results")
  })

  it("turns kinds on and off, in kind order", () => {
    const onKindsChange = renderPanel(["shop"])
    fireEvent.click(screen.getByRole("button", { name: "Vending" }))
    expect(onKindsChange).toHaveBeenLastCalledWith(["vending", "shop"])
  })

  it("keeps the last kind on", () => {
    const onKindsChange = renderPanel(["shop"])
    fireEvent.click(screen.getByRole("button", { name: "Shops" }))
    expect(onKindsChange).not.toHaveBeenCalled()
  })
})
