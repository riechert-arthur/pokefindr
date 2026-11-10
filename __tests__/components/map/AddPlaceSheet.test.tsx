import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "../../helpers/intl"
import { AddPlaceSheet, type Pin } from "@/components/map/AddPlaceSheet"

const { track } = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock("@/lib/analytics", () => ({ track }))

const PIN: Pin = { lng: -104.9876, lat: 39.7392 }
const DUPE = { id: "d1", name: "Grant Street Games", source: "location", address: "1460 Grant St", city: "Denver", state: "CO", meters: 85 }

/** Answers the API: duplicates for the location step, and the POST's status and body. */
function mockApi({ duplicates = [] as unknown[], post = { status: 201, body: { id: "s1", status: "pending" } as Record<string, unknown> } } = {}) {
  const calls: { url: string; body?: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.startsWith("/api/submissions/duplicates")) return new Response(JSON.stringify({ duplicates }))
      if (url === "/api/submissions") return new Response(JSON.stringify(post.body), { status: post.status })
      return new Response(JSON.stringify({ results: [] }))
    }),
  )
  return calls
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }))
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
/** Lets the debounced duplicate check run and its fetch settle. */
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400)
  })
}

function setup(props: Partial<Parameters<typeof AddPlaceSheet>[0]> = {}) {
  const handlers = { onPinChange: vi.fn(), onCancel: vi.fn(), onSubmitted: vi.fn(), onKindChange: vi.fn() }
  const view = render(<AddPlaceSheet pin={null} {...handlers} {...props} />)
  return { ...handlers, ...view }
}

describe("AddPlaceSheet", () => {
  it("goes type → location → details → review, and sends a card shop", async () => {
    const calls = mockApi()
    const { onKindChange, onSubmitted, rerender, onPinChange, onCancel } = setup()
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled()
    fireEvent.click(screen.getByRole("radio", { name: /Card shop/ }))
    expect(onKindChange).toHaveBeenCalledWith("shop")
    next()

    // Location: can't continue until the pin is placed (a map click, outside this component).
    expect(screen.getByRole("button", { name: "Place the pin to continue" })).toBeDisabled()
    rerender(<AddPlaceSheet pin={PIN} onPinChange={onPinChange} onCancel={onCancel} onSubmitted={onSubmitted} onKindChange={onKindChange} />)
    await settle()
    next()

    // Details: required fields are checked here, next to the field.
    next()
    expect(screen.getByText("Enter a name.")).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true")
    type("Name", "Mile High Cards")
    type(/City/, "Denver")
    type(/Website/, "milehighcards.example")
    next()
    expect(screen.getByText("Enter a link starting with https://")).toBeInTheDocument()
    type(/Website/, "https://milehighcards.example")
    fireEvent.click(screen.getByRole("checkbox", { name: "Singles" }))
    next()

    // Review, then send.
    expect(screen.getByText("Mile High Cards")).toBeInTheDocument()
    expect(screen.getByText("Singles")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Send for review" }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith({ id: "s1", name: "Mile High Cards" }))
    // Counted with the kind only (#137).
    expect(track).toHaveBeenCalledWith("add_place_submit", { kind: "shop", outcome: "sent" })
    expect(calls.find((c) => c.url === "/api/submissions")?.body).toEqual({
      submission: { kind: "shop", name: "Mile High Cards", lng: PIN.lng, lat: PIN.lat, address: "", city: "Denver", state: "", countryCode: "US", website: "https://milehighcards.example", hours: "", sells: ["singles"] },
      confirmDuplicate: false,
    })
  })

  it("warns about places nearby, and needs a tick to send anyway", async () => {
    const calls = mockApi({ duplicates: [DUPE] })
    setup({ pin: PIN, initialKind: "shop" })
    await settle()
    expect(screen.getByText("This might already be on the map")).toBeInTheDocument()
    expect(screen.getByText("Grant Street Games")).toBeInTheDocument()
    next()
    type("Name", "Mile High Cards")
    type(/City/, "Denver")
    next()
    const send = screen.getByRole("button", { name: "Send for review" })
    expect(send).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox", { name: /This is a different place/ }))
    fireEvent.click(send)
    await waitFor(() => expect(calls.find((c) => c.url === "/api/submissions")?.body).toMatchObject({ confirmDuplicate: true }))
  })

  it("asks for an event's start, reads it in the event's zone, and shows the server's field error", async () => {
    const calls = mockApi({ post: { status: 400, body: { error: "That date has passed.", field: "startsAt" } } })
    setup({ pin: PIN, initialKind: "event" })
    await settle()
    next()
    type("Name", "League night")
    type(/City/, "Denver")
    type(/State/, "co")
    expect(screen.getByText(/In the event's local time: Mountain Time/)).toBeInTheDocument()
    next()
    expect(screen.getByText("Pick when it starts.")).toBeInTheDocument()
    type("Starts", "2026-11-20T18:00")
    next()
    expect(screen.getByText("Fri, Nov 20, 6:00 PM, Mountain Time")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Send for review" }))
    expect(await screen.findByText("That date has passed.")).toBeInTheDocument()
    // 6 PM in Denver, wherever the person typing it is.
    expect(calls.find((c) => c.url === "/api/submissions")?.body).toMatchObject({ submission: { startsAt: "2026-11-21T01:00:00.000Z", state: "CO" } })
    expect(screen.getByLabelText("Starts")).toHaveAttribute("aria-invalid", "true")
  })

  it("counts a send that couldn't reach PokeFindr as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/submissions") throw new TypeError("Failed to fetch")
        return new Response(JSON.stringify({ duplicates: [], results: [] }))
      }),
    )
    track.mockClear()
    setup({ pin: PIN, initialKind: "shop" })
    await settle()
    next()
    type("Name", "Mile High Cards")
    type(/City/, "Denver")
    next()
    fireEvent.click(screen.getByRole("button", { name: "Send for review" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach PokeFindr")
    expect(track).toHaveBeenCalledWith("add_place_submit", { kind: "shop", outcome: "error" })
  })

  it("says when the daily limit is reached", async () => {
    mockApi({ post: { status: 429, body: { error: "You've added the most places you can today. Try again tomorrow." } } })
    setup({ pin: PIN, initialKind: "shop" })
    await settle()
    next()
    type("Name", "Mile High Cards")
    type(/City/, "Denver")
    next()
    fireEvent.click(screen.getByRole("button", { name: "Send for review" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again tomorrow")
  })

  it("cancels from the first step", () => {
    mockApi()
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onCancel).toHaveBeenCalled()
  })
})
