import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { LocationDetails } from "@/components/map/LocationDetails"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock("@/components/providers/SessionProvider", () => ({ useSessionContext: () => ({ session: { username: "ash" } }) }))

const LOCATION = { id: "loc-1", longitude: -122.33, latitude: 47.61, retailer: "QFC", address: "1401 Broadway", city: "Seattle", state: "WA", machineID: "Q1", kind: "vending" }

afterEach(() => vi.unstubAllGlobals())

describe("LocationDetails", () => {
  it("returns focus to Report a problem when the report form closes", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ reviews: [] }))))
    render(<LocationDetails location={LOCATION} backLabel="Back" onBack={vi.fn()} />)
    const report = screen.getByRole("button", { name: "Report a problem" })
    fireEvent.click(report)
    expect(report).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(report).toHaveAttribute("aria-expanded", "false")
    expect(report).toHaveFocus()
  })
})
