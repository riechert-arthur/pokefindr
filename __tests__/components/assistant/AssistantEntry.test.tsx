import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "../../helpers/intl"

const push = vi.fn()
vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), useRouter: () => ({ push }) }))

import { AssistantEntry } from "@/components/assistant/AssistantEntry"
import { takeHandOff } from "@/lib/assistant/hand-off"

afterEach(() => {
  push.mockClear()
  takeHandOff()
})

const entry = (props: Partial<Parameters<typeof AssistantEntry>[0]> = {}) =>
  render(<AssistantEntry viewer={null} suggestion={null} onSuggestionUsed={vi.fn()} hasSavedChat={false} {...props} />)

describe("AssistantEntry (#391)", () => {
  it("opens /chat with a typed question, and the viewer's location, handed over", () => {
    entry({ viewer: { lng: -122.34, lat: 47.61 } })
    const box = screen.getByRole("textbox", { name: "Message the assistant" })
    fireEvent.change(box, { target: { value: "  machines in Seattle?  " } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(push).toHaveBeenCalledWith("/chat")
    expect(takeHandOff()).toEqual({ question: "machines in Seattle?", viewer: { lng: -122.34, lat: 47.61 } })
  })

  it("opens /chat with a tapped suggestion", () => {
    const onSuggestionUsed = vi.fn()
    entry({ suggestion: "Vending machines in Denver", onSuggestionUsed })
    expect(onSuggestionUsed).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith("/chat")
    expect(takeHandOff()?.question).toBe("Vending machines in Denver")
  })

  it("sends nothing for an empty question", () => {
    entry()
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message the assistant" }), { key: "Enter" })
    expect(push).not.toHaveBeenCalled()
    expect(takeHandOff()).toBeNull()
  })

  it("links back to a saved conversation", () => {
    const { rerender } = entry()
    expect(screen.queryByRole("link", { name: "Continue your chat" })).toBeNull()
    rerender(<AssistantEntry viewer={null} suggestion={null} onSuggestionUsed={vi.fn()} hasSavedChat />)
    expect(screen.getByRole("link", { name: "Continue your chat" })).toHaveAttribute("href", "/chat")
  })
})
