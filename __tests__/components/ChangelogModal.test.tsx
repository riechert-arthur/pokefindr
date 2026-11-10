import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "../helpers/intl"
import ChangelogModal from "@/components/ChangelogModal"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("ChangelogModal (#298)", () => {
  it("doesn't open on a first visit, and remembers the release as seen", () => {
    render(<ChangelogModal />)
    expect(screen.queryByText(/What's New in Version/)).toBeNull()
    expect(localStorage.getItem("changelog_seen_version")).toBe("1.2")
  })

  it("opens for someone who last saw an older release", () => {
    localStorage.setItem("changelog_seen_version", "1.1")
    render(<ChangelogModal />)
    expect(screen.getByText("What's New in Version 1.2")).toBeInTheDocument()
  })

  it("stays closed once the release has been seen", () => {
    localStorage.setItem("changelog_seen_version", "1.2")
    render(<ChangelogModal />)
    expect(screen.queryByText(/What's New in Version/)).toBeNull()
  })
})
