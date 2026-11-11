import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "../../helpers/intl"
import { MapFilterRow } from "@/components/map/MapFilterRow"
import { resetRetailersForTests } from "@/components/map/RetailerFilter"

beforeEach(() => {
  resetRetailersForTests()
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ retailers: [{ retailer: "Safeway", count: 417 }] }))))
})
afterEach(() => vi.unstubAllGlobals())

const row = (props: Partial<Parameters<typeof MapFilterRow>[0]> = {}) => {
  const onRadiusChange = vi.fn()
  const onRetailersChange = vi.fn()
  render(<MapFilterRow radius={null} onRadiusChange={onRadiusChange} vendingShown retailers={[]} onRetailersChange={onRetailersChange} {...props} />)
  return { onRadiusChange, onRetailersChange }
}

describe("MapFilterRow (#361)", () => {
  it("shows the vending retailer filter while vending machines are on, and no radius without a place", () => {
    row()
    const group = screen.getByRole("group", { name: "Map filters" })
    expect(within(group).getByRole("button", { name: "Retailer" })).toBeInTheDocument()
    expect(within(group).queryByRole("button", { name: /Within/ })).not.toBeInTheDocument()
    expect(within(group).queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument()
  })

  it("renders nothing when no filter applies", () => {
    row({ vendingShown: false })
    expect(screen.queryByRole("group", { name: "Map filters" })).not.toBeInTheDocument()
  })

  it("starts with the radius once a place is searched, and changes it from its menu", () => {
    const { onRadiusChange } = row({ radius: 10, vendingShown: false })
    fireEvent.click(screen.getByRole("button", { name: "Within 10 mi" }))
    expect(screen.getByRole("radio", { name: "10 mi" })).toHaveAttribute("aria-checked", "true")
    fireEvent.click(screen.getByRole("radio", { name: "25 mi" }))
    expect(onRadiusChange).toHaveBeenCalledWith(25)
    expect(screen.queryByRole("radio", { name: "25 mi" })).not.toBeInTheDocument()
  })

  it("clears the picked retailers", () => {
    const { onRetailersChange } = row({ retailers: ["Safeway"] })
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(onRetailersChange).toHaveBeenCalledWith([])
  })

  it("hides the retailer filter while vending machines are off", () => {
    row({ radius: 10, vendingShown: false, retailers: ["Safeway"] })
    expect(screen.queryByRole("button", { name: /Retailer/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument()
  })
})
