import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { ReportsTable } from "@/components/admin/ReportsTable"
import { RefreshSummary } from "@/components/admin/useRefreshSummary"
import type { ReportedLocation } from "@/lib/admin/reports"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

const row = (over: Partial<ReportedLocation> & { id: string; name: string }): ReportedLocation => ({
  location: { id: over.id, name: over.name, address: "1 Main St", city: "Denver", state: "CO", machineId: "Q00101", kind: "vending", hidden: false },
  open: 3,
  total: 3,
  reason: "gone",
  lastReportAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  status: "open",
  lastAction: null,
  ...over,
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function serve(rows: ReportedLocation[]) {
  const calls: { url: string; body?: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (init?.method === "POST") return new Response(JSON.stringify({ ok: true, reports: 3 }))
      return new Response(JSON.stringify({ locations: rows }))
    }),
  )
  return calls
}

describe("ReportsTable", () => {
  it("lists reported locations with the problem, a count that's red at 3+, and actions for open ones", async () => {
    serve([row({ id: "a", name: "King Soopers" }), row({ id: "b", name: "Frys", open: 0, total: 1, status: "hidden", location: { id: "b", name: "Frys", address: "", city: "Phoenix", state: "AZ", machineId: null, kind: "vending", hidden: true }, lastAction: { action: "hide", at: new Date().toISOString(), by: "misty" } })])
    render(<ReportsTable />)
    const kroger = (await screen.findByText("King Soopers")).closest("tr")!
    expect(within(kroger).getByText("It's gone or was removed")).toBeInTheDocument()
    expect(within(kroger).getByText("3")).toHaveClass("text-destructive")
    expect(within(kroger).getByText("Q00101")).toBeInTheDocument()
    for (const name of ["Dismiss", "Mark fixed", "Hide location"]) expect(within(kroger).getByRole("button", { name })).toBeInTheDocument()
    expect(within(kroger).getByRole("link", { name: "View King Soopers on the map" })).toHaveAttribute("href", "/map?location=a")

    const frys = screen.getByText("Frys").closest("tr")!
    expect(within(frys).getByText("Hidden")).toBeInTheDocument()
    expect(within(frys).getByText(/Hidden by misty/)).toBeInTheDocument()
    expect(within(frys).getByRole("button", { name: "Reopen" })).toBeInTheDocument()
    // A hidden location isn't on the map to view.
    expect(within(frys).queryByRole("link", { name: /View/ })).toBeNull()
  })

  it("acts, then refreshes the list and the admin's counts", async () => {
    const calls = serve([row({ id: "a", name: "King Soopers" })])
    const refreshSummary = vi.fn()
    render(
      <RefreshSummary.Provider value={refreshSummary}>
        <ReportsTable />
      </RefreshSummary.Provider>,
    )
    fireEvent.click(await screen.findByRole("button", { name: "Hide location" }))
    await waitFor(() => expect(refreshSummary).toHaveBeenCalled())
    expect(calls.find((c) => c.url === "/api/admin/reports/a")?.body).toEqual({ action: "hide" })
    expect(calls.filter((c) => c.url === "/api/admin/reports")).toHaveLength(2)
  })

  it("says when nothing is reported", async () => {
    serve([])
    render(<ReportsTable />)
    expect(await screen.findByText("Nothing reported")).toBeInTheDocument()
  })
})
