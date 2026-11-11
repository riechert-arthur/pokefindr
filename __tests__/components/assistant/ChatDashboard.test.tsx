import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "../../helpers/intl"
import type { AssistantEvent } from "@/lib/types/assistant-stream"

vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), usePathname: () => "/chat", useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/providers/SidebarContextProvider", () => ({ useSidebar: () => ({ isSidebarOpen: false, toggleSidebar: vi.fn() }) }))
vi.mock("@/components/providers/SessionProvider", () => ({ useSessionContext: () => ({ session: { id: "u1", username: "ash" }, isLoading: false }) }))
vi.mock("@/components/pokefindr/UserMenu", () => ({ UserMenu: () => null }))

import { ChatDashboard } from "@/components/assistant/ChatDashboard"
import { handOff, takeHandOff } from "@/lib/assistant/hand-off"
import { saveChat } from "@/lib/assistant/saved-chat"

const done: AssistantEvent = { type: "done", stop: "end_turn", memory: "Sure.", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 1 }, model: "claude-opus-5-5", turnId: "turn-1" }
const answer = () => new Response([{ type: "text", text: "Sure." }, done].map((e) => JSON.stringify(e)).join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson" } })

// Before each, not after: an unmounting chat saves itself (#346), after an afterEach would run.
beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.unstubAllGlobals()
  takeHandOff()
})

describe("ChatDashboard (#391)", () => {
  it("asks the question handed over from /home, with its location, without showing the empty state first", async () => {
    const fetchMock = vi.fn(async () => answer())
    vi.stubGlobal("fetch", fetchMock)
    handOff("machines in Seattle?", { lng: -122.34, lat: 47.61 })
    render(<ChatDashboard userId="u1" hasSavedChat={false} />)
    expect(screen.queryByRole("heading", { name: "Ask the assistant" })).toBeNull()
    expect(await screen.findByText("Sure.")).toBeInTheDocument()
    expect(screen.getByText("machines in Seattle?")).toBeInTheDocument()
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ messages: [{ role: "user", content: "machines in Seattle?" }], viewer: { lng: -122.34, lat: 47.61 } })
  })

  it("shows a greeting and the suggestions with no conversation, and a suggestion asks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer()))
    render(<ChatDashboard userId="u1" hasSavedChat={false} />)
    expect(screen.getByRole("heading", { name: "Ask the assistant" })).toBeInTheDocument()
    const chip = screen.getAllByRole("button").find((b) => b.textContent?.includes("Denver"))!
    fireEvent.click(chip)
    expect(await screen.findByText("Sure.")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Ask the assistant" })).toBeNull())
  })

  it("opens on the saved conversation (#346), and shows the empty state when there turns out to be none", async () => {
    saveChat("u1", [
      { id: 1, role: "user", text: "machines in Seattle?" },
      { id: 2, role: "assistant", text: "Safeway is closest.", cards: [], status: null, note: null, memory: null, turnId: null, done: true },
    ])
    const { unmount } = render(<ChatDashboard userId="u1" hasSavedChat />)
    expect(screen.queryByRole("heading", { name: "Ask the assistant" })).toBeNull()
    expect(screen.getByText("Safeway is closest.")).toBeInTheDocument()
    unmount()
    localStorage.clear()
    render(<ChatDashboard userId="u1" hasSavedChat />)
    expect(await screen.findByRole("heading", { name: "Ask the assistant" })).toBeInTheDocument()
  })
})
