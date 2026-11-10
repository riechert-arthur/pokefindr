import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "../../helpers/intl"
import { SearchCommand, type SearchCommandItem, type SearchCommandStatus } from "@/components/pokefindr/SearchCommand"

const ITEMS: SearchCommandItem[] = [
  { id: "area-0", group: "areas", label: "Denver, CO", meta: "50 places within 10 mi", icon: null },
  { id: "area-1", group: "areas", label: "Denton, TX", meta: "2 places within 10 mi", icon: null },
  { id: "location-x", group: "locations", label: "King Soopers", detail: "1155 E 9th Ave, Denver", meta: "Vending machine", icon: null },
]

/** SearchCommand with its query kept in state, like PlaceSearch. */
function Harness({ items = ITEMS, status = "ready" as SearchCommandStatus, onPick = vi.fn(), variant = "panel" as const, onClear }: {
  items?: SearchCommandItem[]
  status?: SearchCommandStatus
  onPick?: (id: string) => void
  variant?: "hero" | "panel"
  onClear?: () => void
}) {
  const [query, setQuery] = useState("")
  return (
    <SearchCommand
      query={query}
      onQueryChange={setQuery}
      items={items}
      status={status}
      onPick={onPick}
      variant={variant}
      placeholder="Search city or address"
      onClear={onClear}
    />
  )
}

const input = () => screen.getByRole("combobox")
const type = (text: string) => {
  fireEvent.focus(input())
  fireEvent.change(input(), { target: { value: text } })
}
const selected = () => document.querySelector('[cmdk-item][data-selected="true"]')?.textContent

describe("SearchCommand", () => {
  it("lists areas and locations under their headings, with their counts", () => {
    render(<Harness />)
    type("Den")
    expect(screen.getByText("Areas")).toBeInTheDocument()
    expect(screen.getByText("Locations")).toBeInTheDocument()
    expect(screen.getByText("50 places within 10 mi")).toBeInTheDocument()
    expect(screen.getByText("1155 E 9th Ave, Denver")).toBeInTheDocument()
    expect(input()).toHaveAttribute("aria-expanded", "true")
  })

  it("keeps the highlight when the same items update (counts arriving)", () => {
    const { rerender } = render(<Harness />)
    type("Den")
    fireEvent.keyDown(input(), { key: "ArrowDown" })
    expect(selected()).toContain("Denton, TX")
    rerender(<Harness items={ITEMS.map((i) => ({ ...i, meta: `${i.meta} ` }))} />)
    expect(selected()).toContain("Denton, TX")
    // A new list (new ids) starts at the top again.
    rerender(<Harness items={[{ ...ITEMS[0], id: "area-0-Boulder, CO", label: "Boulder, CO" }, ...ITEMS.slice(1)]} />)
    expect(selected()).toContain("Boulder, CO")
  })

  it("stays closed below two characters", () => {
    render(<Harness />)
    type("D")
    expect(screen.queryByText("Areas")).not.toBeInTheDocument()
    expect(input()).toHaveAttribute("aria-expanded", "false")
  })

  it("highlights the first result, moves with the arrow keys, and opens one with Enter", () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    type("Den")
    expect(selected()).toContain("Denver, CO")
    fireEvent.keyDown(input(), { key: "ArrowDown" })
    expect(selected()).toContain("Denton, TX")
    fireEvent.keyDown(input(), { key: "Enter" })
    expect(onPick).toHaveBeenCalledWith("area-1")
    // Picking closes the list.
    expect(screen.queryByText("Areas")).not.toBeInTheDocument()
  })

  it("opens a result on click", () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    type("Den")
    fireEvent.click(screen.getByText("King Soopers"))
    expect(onPick).toHaveBeenCalledWith("location-x")
  })

  it("picks the first result once it arrives when Enter comes first", () => {
    const onPick = vi.fn()
    const { rerender } = render(<Harness items={[]} status="loading" onPick={onPick} />)
    type("Denver")
    expect(screen.getByText("Searching…")).toBeInTheDocument()
    fireEvent.keyDown(input(), { key: "Enter" })
    expect(onPick).not.toHaveBeenCalled()
    rerender(<Harness items={ITEMS} status="ready" onPick={onPick} />)
    expect(onPick).toHaveBeenCalledWith("area-0")
  })

  it("says when nothing matches, and when search is down", () => {
    const { rerender } = render(<Harness items={[]} status="ready" />)
    type("qqzx")
    expect(screen.getByText(/No places match “qqzx”/)).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("No matches.")
    rerender(<Harness items={[]} status="error" />)
    expect(screen.getByText("Search isn't working right now. Try again in a moment.")).toBeInTheDocument()
  })

  it("announces how many results there are", () => {
    render(<Harness />)
    type("Den")
    expect(screen.getByRole("status")).toHaveTextContent("3 results")
  })

  it("closes on Escape and reopens on the next keystroke", () => {
    render(<Harness />)
    type("Den")
    fireEvent.keyDown(input(), { key: "Escape" })
    expect(screen.queryByText("Areas")).not.toBeInTheDocument()
    fireEvent.change(input(), { target: { value: "Denv" } })
    expect(screen.getByText("Areas")).toBeInTheDocument()
  })

  it("has a Search button in the hero that opens the highlighted result", () => {
    const onPick = vi.fn()
    render(<Harness variant="hero" onPick={onPick} />)
    type("Den")
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    expect(onPick).toHaveBeenCalledWith("area-0")
  })

  it("clears with the ✕", () => {
    const onClear = vi.fn()
    render(<Harness onClear={onClear} />)
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument()
    type("Den")
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
    expect(onClear).toHaveBeenCalled()
  })
})
