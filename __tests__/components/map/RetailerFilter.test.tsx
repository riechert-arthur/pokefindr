import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "../../helpers/intl"
import { RetailerFilter, resetRetailersForTests } from "@/components/map/RetailerFilter"

const RETAILERS = [
  { retailer: "Safeway", count: 417 },
  { retailer: "QFC", count: 120 },
]

beforeEach(() => {
  resetRetailersForTests()
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ retailers: RETAILERS }))))
})
afterEach(() => vi.unstubAllGlobals())

describe("RetailerFilter", () => {
  it("lists retailers with their counts and picks one", async () => {
    const onChange = vi.fn()
    render(<RetailerFilter selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Retailer" }))
    await waitFor(() => expect(screen.getByText("Safeway")).toBeInTheDocument())
    expect(screen.getByText("417")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: /Safeway/ }))
    expect(onChange).toHaveBeenCalledWith(["Safeway"])
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled()
  })

  it("names the pick on the chip", () => {
    render(<RetailerFilter selected={["Safeway"]} onChange={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Retailer: Safeway" })).toHaveTextContent("Safeway")
  })

  it("counts several picks, keeps a linked retailer outside the top list, and clears", async () => {
    const onChange = vi.fn()
    render(<RetailerFilter selected={["QFC", "Dillons"]} onChange={onChange} />)
    const trigger = screen.getByRole("button", { name: "2 retailers" })
    expect(trigger).toHaveTextContent("2 retailers")
    fireEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Dillons/ })).toBeChecked())
    expect(screen.getByRole("checkbox", { name: /QFC/ })).toBeChecked()
    fireEvent.click(screen.getByRole("checkbox", { name: /QFC/ }))
    expect(onChange).toHaveBeenCalledWith(["Dillons"])
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it("tries again when reopened after the list failed to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })))
    render(<RetailerFilter selected={[]} onChange={vi.fn()} />)
    const button = screen.getByRole("button", { name: "Retailer" })
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByText(/Couldn.t load retailers/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ retailers: RETAILERS }))))
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByText("Safeway")).toBeInTheDocument())
    expect(screen.queryByText(/Couldn.t load retailers/)).not.toBeInTheDocument()
  })

})
