import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "../helpers/intl"
import ChangelogModal from "@/components/ChangelogModal"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("ChangelogModal (#298, #347)", () => {
  it("doesn't open on a first visit, and remembers the release as seen", () => {
    render(<ChangelogModal />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(localStorage.getItem("changelog_seen_version")).toBe("2.0")
  })

  it("announces 2.0 to someone who last saw 1.2, as a labelled dialog with a link to everything new", async () => {
    localStorage.setItem("changelog_seen_version", "1.2")
    render(<ChangelogModal />)
    const dialog = await screen.findByRole("dialog", { name: "What's New in Version 2.0" })
    expect(dialog).toHaveTextContent("A Fresh Look")
    expect(dialog).toHaveTextContent("PokeFindr Assistant")
    expect(screen.getByRole("link", { name: "See everything that's new" })).toHaveAttribute("href", "/changelog")
  })

  it("closes with Escape and stays closed", async () => {
    localStorage.setItem("changelog_seen_version", "1.2")
    render(<ChangelogModal />)
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(localStorage.getItem("changelog_seen_version")).toBe("2.0")
  })

  it("closes with its button", async () => {
    localStorage.setItem("changelog_seen_version", "1.1")
    render(<ChangelogModal />)
    fireEvent.click(await screen.findByRole("button", { name: "Got it!" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(localStorage.getItem("changelog_seen_version")).toBe("2.0")
  })

  it("speaks Spanish on a Spanish page", async () => {
    localStorage.setItem("changelog_seen_version", "1.2")
    render(<ChangelogModal />, { locale: "es" })
    expect(await screen.findByRole("dialog", { name: "Novedades de la versión 2.0" })).toHaveTextContent("Un nuevo diseño")
  })

  it("stays closed once the release has been seen", () => {
    localStorage.setItem("changelog_seen_version", "2.0")
    render(<ChangelogModal />)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
