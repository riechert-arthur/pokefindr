import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SummaryCards } from "@/components/admin/SummaryCards"
import type { AdminSummary } from "@/lib/admin/summary"

afterEach(cleanup)

const SUMMARY: AdminSummary = {
  queue: { count: 3, oldestAt: new Date(Date.now() - 30 * 3600_000).toISOString() },
  reports: { locations: 3, reports: 6, maxOnOne: 3 },
  live: { total: 1492, byKind: { vending: 1457, shop: 30, event: 5 } },
  sync: { status: "paused", detail: "Waiting on an approved data source (#85)", at: null },
}

describe("SummaryCards", () => {
  it("shows the four cards with their pills, and opens each section", () => {
    const onOpen = vi.fn()
    render(<SummaryCards summary={SUMMARY} role="admin" onOpen={onOpen} />)
    expect(screen.getByRole("button", { name: /Waiting for review 3 Oldest 1 day ago Over 24 h/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Open reports 3 6 reports on 3 locations 3\+ on one place/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Live on the map 1,492 1,457 vending · 30 shops · 5 events Serving/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Location sync Paused/ }))
    expect(onOpen).toHaveBeenCalledWith("jobs")
  })

  it("shows moderators only the Moderation cards", () => {
    render(<SummaryCards summary={SUMMARY} role="moderator" onOpen={vi.fn()} />)
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.queryByText("Live on the map")).toBeNull()
  })

  it("says when the queue and reports are clear", () => {
    render(<SummaryCards summary={{ ...SUMMARY, queue: { count: 0, oldestAt: null }, reports: { locations: 0, reports: 0, maxOnOne: 0 } }} role="admin" onOpen={vi.fn()} />)
    expect(screen.getByText("Queue is clear")).toBeInTheDocument()
    expect(screen.getByText("Nothing reported")).toBeInTheDocument()
    expect(screen.getByText("Empty")).toBeInTheDocument()
  })
})
