import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "../../helpers/intl"
import { AddVendingForm } from "@/components/admin/AddVendingForm"
import type { VendingOverlap } from "@/lib/admin/vending"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const OVERLAP: VendingOverlap = { id: "o1", machineId: "Q00014", retailer: "Fred Meyer", address: "12221 120th Ave NE", city: "Kirkland", state: "WA", meters: 23, reasons: ["address", "distance"], active: true }

function serve(overlaps: VendingOverlap[]) {
  const calls: { url: string; method: string; body?: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url === "/api/admin/vending/check") return new Response(JSON.stringify({ overlaps }))
      if (url === "/api/admin/vending") return new Response(JSON.stringify({ id: "new1" }), { status: 201 })
      if (url.startsWith("/api/admin/vending/")) return new Response(JSON.stringify({ ok: true }))
      if (url.startsWith("/api/locations/retailers")) return new Response(JSON.stringify({ retailers: [{ retailer: "Fred Meyer", count: 3 }] }))
      return new Response(JSON.stringify({ cities: [], results: [] }))
    }),
  )
  return calls
}

function fill() {
  const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
  type(/Retailer/, "Fred Meyer")
  type(/Machine ID/, "q01557")
  type(/Street address/, "12221 120th Avenue Northeast")
  type(/City and state/, "Kirkland, WA")
  type(/^Pin/, "47.70793, -122.18380")
}

describe("AddVendingForm", () => {
  it("shows what overlaps and keeps Add disabled, with no override", async () => {
    serve([OVERLAP])
    render(<AddVendingForm />)
    fill()
    const panel = (await screen.findByText("Already on the map")).closest("section")!
    expect(within(panel).getByText("Fred Meyer")).toBeInTheDocument()
    expect(within(panel).getByText("Same address")).toBeInTheDocument()
    expect(within(panel).getByText("Same spot")).toBeInTheDocument()
    expect(within(panel).getByText("75 ft")).toBeInTheDocument()
    expect(within(panel).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/map?location=o1")
    expect(screen.getByRole("button", { name: "Add vending machine" })).toBeDisabled()
  })

  it("adds once nothing overlaps, lists it with View and Undo, and undoes it", async () => {
    const calls = serve([])
    render(<AddVendingForm />)
    expect(screen.getByRole("button", { name: "Add vending machine" })).toBeDisabled()
    fill()
    await screen.findByText("No overlap")
    const add = screen.getByRole("button", { name: "Add vending machine" })
    await waitFor(() => expect(add).toBeEnabled())
    fireEvent.click(add)
    const added = (await screen.findByText("Added this visit")).closest("section")!
    expect(calls.find((c) => c.url === "/api/admin/vending")?.body).toEqual({ retailer: "Fred Meyer", machineId: "Q01557", address: "12221 120th Avenue Northeast", city: "Kirkland", state: "WA", lat: 47.70793, lng: -122.1838 })
    expect(within(added).getByText(/Fred Meyer Q01557/)).toBeInTheDocument()
    fireEvent.click(within(added).getByRole("button", { name: "Undo" }))
    expect(await within(added).findByText("Undone")).toBeInTheDocument()
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("/api/admin/vending/new1")
    // The form is clear for the next one.
    expect(screen.getByLabelText(/Machine ID/)).toHaveValue("")
  })

  it("marks a malformed machine ID", () => {
    serve([])
    render(<AddVendingForm />)
    fireEvent.change(screen.getByLabelText(/Machine ID/), { target: { value: "Q123" } })
    expect(screen.getByLabelText(/Machine ID/)).toHaveAttribute("aria-invalid", "true")
  })
})
