import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "../../helpers/intl"
import { AssistantChat } from "@/components/assistant/AssistantChat"
import type { AssistantEvent } from "@/lib/types/assistant-stream"

const place = { id: "loc-1", name: "Safeway", kind: "vending" as const, address: "1 Pike St", city: "Seattle", state: "WA", lng: -122.34, lat: 47.61, miles: 0.4 }

/** A streamed NDJSON response, sent in two chunks that split a line. */
function ndjson(events: AssistantEvent[]) {
  const text = events.map((e) => JSON.stringify(e)).join("\n") + "\n"
  const mid = Math.floor(text.length / 2)
  const enc = new TextEncoder()
  return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(text.slice(0, mid))); c.enqueue(enc.encode(text.slice(mid))); c.close() } }), { headers: { "Content-Type": "application/x-ndjson" } })
}

const done = (memory: string): AssistantEvent => ({ type: "done", stop: "end_turn", memory, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 1 }, model: "claude-opus-5-5", turnId: "turn-1" })

function setup(props: Partial<Parameters<typeof AssistantChat>[0]> = {}) {
  const onChattingChange = vi.fn()
  render(<AssistantChat viewer={null} suggestion={null} onSuggestionUsed={vi.fn()} onChattingChange={onChattingChange} {...props} />)
  const box = screen.getByRole("textbox", { name: "Message the assistant" })
  const ask = (q: string) => {
    fireEvent.change(box, { target: { value: q } })
    fireEvent.keyDown(box, { key: "Enter" })
  }
  return { ask, onChattingChange }
}

afterEach(() => vi.unstubAllGlobals())

describe("AssistantChat", () => {
  it("streams an answer with its cards, and sends the answer's memory back with the next question", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ndjson([{ type: "status", text: "Searching locations…" }, { type: "card", card: { type: "places", title: "1 within 10 mi of Seattle, WA", total: 1, places: [place], near: null } }, { type: "text", text: "**Safeway** is " }, { type: "text", text: "closest." }, done("Safeway is closest.\n[ids: loc-1]")]))
      .mockResolvedValueOnce(ndjson([{ type: "text", text: "Sure." }, done("Sure.")]))
    vi.stubGlobal("fetch", fetchMock)
    const { ask, onChattingChange } = setup({ viewer: { lng: -122.34, lat: 47.61 } })

    ask("machines in Seattle?")
    expect(await screen.findByText("closest.", { exact: false })).toBeInTheDocument()
    expect(screen.getByText("Safeway", { selector: "strong" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Safeway on the map" })).toHaveAttribute("href", "/map?location=loc-1")
    expect(onChattingChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByRole("group", { name: "Rate this answer" })).toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ messages: [{ role: "user", content: "machines in Seattle?" }], viewer: { lng: -122.34, lat: 47.61 } })

    ask("route through them")
    await screen.findByText("Sure.")
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages).toEqual([
      { role: "user", content: "machines in Seattle?" },
      { role: "assistant", content: "Safeway is closest.\n[ids: loc-1]" },
      { role: "user", content: "route through them" },
    ])

    fireEvent.click(screen.getByRole("button", { name: "New chat" }))
    expect(screen.queryByText("Sure.")).toBeNull()
    expect(onChattingChange).toHaveBeenLastCalledWith(false)
  })

  it("asks a tapped suggestion right away", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ndjson([{ type: "text", text: "Here." }, done("Here.")]))
    vi.stubGlobal("fetch", fetchMock)
    const onSuggestionUsed = vi.fn()
    setup({ suggestion: "Plan a route through 4 machines near Denver", onSuggestionUsed })
    await screen.findByText("Here.")
    expect(onSuggestionUsed).toHaveBeenCalled()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content).toBe("Plan a route through 4 machines near Denver")
  })

  it("says why when the assistant refuses the request, or errors midway", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: "You've reached today's limit of 100 messages." }), { status: 429 })).mockResolvedValueOnce(ndjson([{ type: "error", message: "The assistant is busy right now." }])))
    const { ask } = setup()
    ask("hi")
    expect(await screen.findByText("You've reached today's limit of 100 messages.")).toBeInTheDocument()
    ask("again")
    expect(await screen.findByText("The assistant is busy right now.")).toBeInTheDocument()
  })

  it("remembers the places of an answer that errored midway", async () => {
    const next = vi.fn().mockResolvedValue(ndjson([{ type: "text", text: "Ok." }, done("Ok.")]))
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ndjson([{ type: "card", card: { type: "places", title: "1 near Seattle", total: 1, places: [place], near: null } }, { type: "error", message: "The assistant is busy right now." }])).mockImplementation(next))
    const { ask } = setup()
    ask("near Seattle")
    await screen.findByText("The assistant is busy right now.")
    ask("route through it")
    await screen.findByText("Ok.")
    expect(JSON.parse(next.mock.calls[0][1].body).messages[1].content).toContain("(id loc-1)")
  })

  it("stops an answer and keeps what came", async () => {
    let enqueue!: (s: string) => void
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        const enc = new TextEncoder()
        const body = new ReadableStream({
          start(c) {
            enqueue = (s) => c.enqueue(enc.encode(s))
            init.signal!.addEventListener("abort", () => c.error(new DOMException("Aborted", "AbortError")))
          },
        })
        return Promise.resolve(new Response(body))
      }),
    )
    const { ask } = setup()
    ask("tell me everything")
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument())
    await act(async () => enqueue(JSON.stringify({ type: "text", text: "Partial answer" }) + "\n"))
    await screen.findByText("Partial answer")
    await act(async () => enqueue(JSON.stringify({ type: "card", card: { type: "places", title: "1 near Seattle", total: 1, places: [place], near: null } }) + "\n"))
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(await screen.findByText("Stopped.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument()

    // The stopped answer's places go back with the next question.
    const next = vi.fn().mockResolvedValue(ndjson([{ type: "text", text: "Ok." }, done("Ok.")]))
    vi.stubGlobal("fetch", next)
    ask("route through that one")
    await screen.findByText("Ok.")
    expect(JSON.parse(next.mock.calls[0][1].body).messages[1].content).toContain("(id loc-1)")
  })
})
