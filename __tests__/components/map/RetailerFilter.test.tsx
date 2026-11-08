import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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
    render(<RetailerFilter selected={[]} onChange={onChange} vendingShown />)
    fireEvent.click(screen.getByRole("button", { name: "Filters" }))
    await waitFor(() => expect(screen.getByText("Safeway")).toBeInTheDocument())
    expect(screen.getByText("417")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: /Safeway/ }))
    expect(onChange).toHaveBeenCalledWith(["Safeway"])
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled()
  })

  it("badges the picked count, keeps a linked retailer outside the top list, and clears", async () => {
    const onChange = vi.fn()
    render(<RetailerFilter selected={["QFC", "Dillons"]} onChange={onChange} vendingShown />)
    const trigger = screen.getByRole("button", { name: "Filters, 2 retailers" })
    expect(trigger).toHaveTextContent("2")
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
    render(<RetailerFilter selected={[]} onChange={vi.fn()} vendingShown />)
    const button = screen.getByRole("button", { name: "Filters" })
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByText(/Couldn.t load retailers/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ retailers: RETAILERS }))))
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByText("Safeway")).toBeInTheDocument())
    expect(screen.queryByText(/Couldn.t load retailers/)).not.toBeInTheDocument()
  })

  it("asks to turn on vending machines first", () => {
    render(<RetailerFilter selected={[]} onChange={vi.fn()} vendingShown={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Filters" }))
    expect(screen.getByText("Turn on vending machines to filter by retailer.")).toBeInTheDocument()
  })
})
