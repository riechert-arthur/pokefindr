import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "../../helpers/intl"

const push = vi.fn()
vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), useRouter: () => ({ push }) }))

import { AssistantEntry } from "@/components/assistant/AssistantEntry"
import { takeHandOff } from "@/lib/assistant/hand-off"
import { saveChat } from "@/lib/assistant/saved-chat"

beforeEach(() => localStorage.clear())
afterEach(() => {
  push.mockClear()
  takeHandOff()
})

const entry = (props: Partial<Parameters<typeof AssistantEntry>[0]> = {}) => render(<AssistantEntry viewer={null} userId="u1" hasSavedChat={false} {...props} />)
const saved = () => saveChat("u1", [{ id: 1, role: "user", text: "machines in Seattle?" }])

describe("AssistantEntry (#391)", () => {
  it("opens /chat with a typed question handed over", () => {
    entry()
    const box = screen.getByRole("textbox", { name: "Message the assistant" })
    fireEvent.change(box, { target: { value: "  machines in Seattle?  " } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(push).toHaveBeenCalledWith("/chat")
    expect(takeHandOff()).toBe("machines in Seattle?")
  })

  it("opens /chat with a tapped suggestion, offering 'closest' once the location is shared", () => {
    const { rerender } = entry()
    expect(screen.queryByRole("button", { name: "What's closest to me?" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Plan a route through 4 machines near Denver" }))
    expect(push).toHaveBeenCalledWith("/chat")
    expect(takeHandOff()).toBe("Plan a route through 4 machines near Denver")
    rerender(<AssistantEntry viewer={{ lng: -122.34, lat: 47.61 }} userId="u1" hasSavedChat={false} />)
    expect(screen.getByRole("group", { name: "Suggestions" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "What's closest to me?" })).toBeInTheDocument()
  })

  it("sends nothing for an empty question", () => {
    entry()
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message the assistant" }), { key: "Enter" })
    expect(push).not.toHaveBeenCalled()
    expect(takeHandOff()).toBeNull()
  })

  it("links back to the conversation this browser has saved", () => {
    saved()
    entry()
    expect(screen.getByRole("link", { name: "Continue your chat" })).toHaveAttribute("href", "/chat")
  })

  it("trusts this browser over a stale server answer, as Back and Forward reuse it (#391 review)", () => {
    entry({ hasSavedChat: true })
    expect(screen.queryByRole("link", { name: "Continue your chat" })).toBeNull()
    saved()
    entry({ hasSavedChat: false })
    expect(screen.getByRole("link", { name: "Continue your chat" })).toBeInTheDocument()
  })
})
