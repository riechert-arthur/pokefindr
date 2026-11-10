import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "../../helpers/intl"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import type { AdminGroup } from "@/lib/admin/sections"

const GROUPS: AdminGroup[] = [
  {
    id: "moderation",
    label: "Moderation",
    sections: [
      { id: "queue", label: "Review queue", sub: "", entitlement: "moderation.view" },
      { id: "reports", label: "Reports", sub: "", entitlement: "moderation.view" },
    ],
  },
  { id: "system", label: "System", sections: [{ id: "jobs", label: "Jobs", sub: "", entitlement: "admin.jobs" }] },
]

const renderSidebar = (onSelect = vi.fn()) =>
  render(<AdminSidebar groups={GROUPS} current="reports" counts={{ queue: { count: 3, hot: true }, reports: { count: 2, hot: false } }} onSelect={onSelect} user={{ username: "misty", role: "admin" }} />)

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("AdminSidebar", () => {
  it("marks the current section, links each one, and shows counts", () => {
    renderSidebar()
    expect(screen.getByRole("link", { name: /Reports/ })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: /Review queue/ })).toHaveAttribute("href", "/admin?section=queue")
    expect(screen.getByLabelText("3 waiting")).toHaveClass("text-destructive")
    expect(screen.getByLabelText("2 waiting")).not.toHaveClass("text-destructive")
    expect(screen.getByText("misty")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Back to the app/ })).toHaveAttribute("href", "/home")
  })

  it("selects a section without a page load", () => {
    const onSelect = vi.fn()
    renderSidebar(onSelect)
    fireEvent.click(screen.getByRole("link", { name: /Jobs/ }), { button: 0 })
    expect(onSelect).toHaveBeenCalledWith("jobs")
  })

  it("folds a group from its heading, shows the summed count, and remembers it", () => {
    renderSidebar()
    const heading = screen.getByRole("button", { name: /Moderation/ })
    fireEvent.click(heading)
    expect(heading).toHaveAttribute("aria-expanded", "false")
    expect(heading).toHaveTextContent("5")
    expect(JSON.parse(localStorage.getItem("pf-admin-nav-collapsed")!)).toEqual(["moderation"])
    cleanup()
    renderSidebar()
    expect(screen.getByRole("button", { name: /Moderation/ })).toHaveAttribute("aria-expanded", "false")
  })
})
