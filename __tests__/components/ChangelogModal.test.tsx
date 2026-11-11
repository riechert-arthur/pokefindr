import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "../helpers/intl"
import ChangelogModal from "@/components/ChangelogModal"
import { CHANGELOG_RELEASES, NEWEST_RELEASE } from "@/lib/changelog"

const NEWEST = NEWEST_RELEASE.version
const PREVIOUS = CHANGELOG_RELEASES[CHANGELOG_RELEASES.length - 2].version

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("ChangelogModal (#298, #347)", () => {
  it("doesn't open on a first visit, and remembers the release as seen", () => {
    render(<ChangelogModal />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(localStorage.getItem("changelog_seen_version")).toBe(NEWEST)
  })

  it("announces the newest release to someone who saw the one before, as a labelled dialog with its highlights and date", async () => {
    localStorage.setItem("changelog_seen_version", PREVIOUS)
    render(<ChangelogModal />)
    const dialog = await screen.findByRole("dialog", { name: `What's New in Version ${NEWEST}` })
    expect(dialog).toHaveTextContent("A Fresh Look")
    expect(dialog).toHaveTextContent("PokeFindr Assistant")
    expect(dialog).toHaveTextContent(/^.*Released \w+ \d{1,2}, \d{4}/)
    expect(screen.getByRole("link", { name: "See everything that's new" })).toHaveAttribute("href", "/changelog")
  })

  it("closes with Escape and stays closed", async () => {
    localStorage.setItem("changelog_seen_version", PREVIOUS)
    render(<ChangelogModal />)
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(localStorage.getItem("changelog_seen_version")).toBe(NEWEST)
  })

  it("closes with its button", async () => {
    localStorage.setItem("changelog_seen_version", "1.1")
    render(<ChangelogModal />)
    fireEvent.click(await screen.findByRole("button", { name: "Got it!" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(localStorage.getItem("changelog_seen_version")).toBe(NEWEST)
  })

  it("speaks Spanish on a Spanish page", async () => {
    localStorage.setItem("changelog_seen_version", PREVIOUS)
    render(<ChangelogModal />, { locale: "es" })
    expect(await screen.findByRole("dialog", { name: `Novedades de la versión ${NEWEST}` })).toHaveTextContent(/Un nuevo diseño.*|Publicada el/)
  })

  it("stays closed once the release has been seen", () => {
    localStorage.setItem("changelog_seen_version", NEWEST)
    render(<ChangelogModal />)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
