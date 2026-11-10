import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "../../helpers/intl"
import { DetailsSheet, directionsUrl, type DetailsLocation } from "@/components/map/DetailsSheet"

const QFC: DetailsLocation = {
  id: "a",
  longitude: -122.3207,
  latitude: 47.6235,
  retailer: "QFC",
  address: "417 Broadway E",
  city: "Seattle",
  state: "WA",
  machineID: "Q00350",
  kind: "vending",
}

const { toast } = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }))
vi.mock("sonner", () => ({ toast }))

const facts = () => Object.fromEntries(screen.getAllByRole("term").map((t) => [t.textContent, t.nextElementSibling?.textContent]))

describe("DetailsSheet", () => {
  it("shows the kind, name, address and a vending machine's facts", () => {
    render(<DetailsSheet location={QFC} backLabel="Back to Seattle, WA" onBack={vi.fn()} />)
    expect(screen.getByText("Vending machine")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "QFC" })).toBeInTheDocument()
    expect(screen.getByText("417 Broadway E, Seattle, WA")).toBeInTheDocument()
    expect(facts()).toEqual({
      Retailer: "QFC",
      Address: "417 Broadway ESeattle, WA",
      "Machine ID": "Q00350",
      Source: "Pokémon Center retailer list",
    })
  })

  it("says when a machine id isn't listed, and adds distances from the viewer and the searched place", () => {
    render(
      <DetailsSheet
        location={{ ...QFC, machineID: "" }}
        backLabel="Back"
        onBack={vi.fn()}
        me={{ lng: -122.3207, lat: 47.6091 }}
        from={{ label: "Seattle, WA", lng: -122.3285, lat: 47.6196 }}
      />,
    )
    const f = facts()
    expect(f["Machine ID"]).toBe("Not listed")
    expect(f["From you"]).toBe("1.0 mi")
    expect(f.Distance).toBe("0.5 mi from Seattle, WA")
  })

  it("goes back, links to directions and copies the link", async () => {
    const onBack = vi.fn()
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<DetailsSheet location={QFC} backLabel="Back to Seattle, WA" onBack={onBack} />)
    fireEvent.click(screen.getByRole("button", { name: "Back to Seattle, WA" }))
    expect(onBack).toHaveBeenCalled()
    expect(screen.getByRole("link", { name: /Directions/ })).toHaveAttribute("href", directionsUrl(QFC))
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }))
    expect(writeText).toHaveBeenCalledWith(window.location.href)
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Link copied", { description: window.location.href }))
  })

  it("builds a Google Maps search for the store", () => {
    expect(directionsUrl(QFC)).toBe("https://www.google.com/maps/search/?api=1&query=QFC%20417%20Broadway%20E%20Seattle%20WA")
  })
})
