import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { FeedbackBar } from "@/components/assistant/FeedbackBar"

afterEach(() => vi.unstubAllGlobals())

const bodies = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string))

describe("FeedbackBar", () => {
  it("sends a thumbs up and thanks", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"))
    vi.stubGlobal("fetch", fetchMock)
    render(<FeedbackBar turnId="t1" />)
    fireEvent.click(screen.getByRole("button", { name: "Good answer" }))
    expect(screen.getByRole("button", { name: "Good answer" })).toHaveAttribute("aria-pressed", "true")
    expect(await screen.findByText("Thanks for the feedback.")).toBeInTheDocument()
    expect(bodies(fetchMock)).toEqual([{ turnId: "t1", vote: "up" }])
  })

  it("asks why on a thumbs down, and sends the reason and comment", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"))
    vi.stubGlobal("fetch", fetchMock)
    render(<FeedbackBar turnId="t1" />)
    fireEvent.click(screen.getByRole("button", { name: "Bad answer" }))
    fireEvent.click(screen.getByRole("radio", { name: "Outdated info" }))
    expect(screen.getByRole("radio", { name: "Outdated info" })).toHaveAttribute("aria-checked", "true")
    fireEvent.change(screen.getByRole("textbox", { name: "Tell us more (optional)" }), { target: { value: " Closed in June " } })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    await screen.findByText("Thanks for the feedback.")
    expect(bodies(fetchMock)).toEqual([
      { turnId: "t1", vote: "down" },
      { turnId: "t1", vote: "down", reason: "outdated", comment: "Closed in June" },
    ])
  })

  it("says when a vote didn't send", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })))
    render(<FeedbackBar turnId="t1" />)
    fireEvent.click(screen.getByRole("button", { name: "Good answer" }))
    await waitFor(() => expect(screen.getByText(/Couldn.t send that/)).toBeInTheDocument())
  })
})
