import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { useLocationReviews, type Review, type ReviewsState } from "@/components/map/useLocationReviews"
import { ReviewSummary, ReviewsSection } from "@/components/map/Reviews"
import { timeAgo } from "@/lib/format/time"

const { toast } = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock("sonner", () => ({ toast }))

const REVIEW: Review = { id: "r1", rating: 4, text: "Stocked on Tuesday", username: "misty", createdAt: new Date().toISOString(), mine: false }

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  vi.stubGlobal("fetch", fn)
  return fn
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("useLocationReviews", () => {
  it("loads, then adds a review at once and keeps it with the server's id", async () => {
    mockFetch((url, init) => (init?.method === "POST" ? json({ success: true, id: "r2" }) : json({ reviews: [REVIEW] })))
    const { result } = renderHook(() => useLocationReviews("loc"))
    await waitFor(() => expect(result.current.status).toBe("ready"))
    expect(result.current.average).toBe(4)
    let done: Promise<boolean>
    act(() => {
      done = result.current.add({ rating: 2, text: "" }, "ash")
    })
    expect(result.current.reviews.map((r) => r.username)).toEqual(["ash", "misty"])
    expect(result.current.average).toBe(3)
    await act(async () => expect(await done).toBe(true))
    expect(result.current.reviews[0]).toMatchObject({ id: "r2", mine: true })
    expect(toast.success).toHaveBeenCalledWith("Review posted", { description: "It shows at the top of the reviews." })
  })

  it("keeps a review saved while an older read of the list was in flight", async () => {
    let finishGet: (r: Response) => void = () => {}
    mockFetch((url, init) =>
      init?.method === "POST" ? json({ success: true, id: "r2" }) : new Promise<Response>((resolve) => (finishGet = resolve)),
    )
    const { result } = renderHook(() => useLocationReviews("loc"))
    await act(async () => expect(await result.current.add({ rating: 5, text: "" }, "ash")).toBe(true))
    // The list was read before the insert committed: it doesn't have r2.
    await act(async () => finishGet(json({ reviews: [REVIEW] })))
    await waitFor(() => expect(result.current.status).toBe("ready"))
    expect(result.current.reviews.map((r) => r.id)).toEqual(["r2", "r1"])
  })

  it("takes a review back, with a toast, when posting fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch((url, init) => (init?.method === "POST" ? json({}, 500) : json({ reviews: [] })))
    const { result } = renderHook(() => useLocationReviews("loc"))
    await waitFor(() => expect(result.current.status).toBe("ready"))
    await act(async () => expect(await result.current.add({ rating: 5, text: "Great" }, "ash")).toBe(false))
    expect(result.current.reviews).toEqual([])
    expect(toast.error).toHaveBeenCalledWith("Couldn't post your review", expect.anything())
  })

  it("puts a deleted review back where it was when the delete fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const mine = { ...REVIEW, id: "m", mine: true }
    mockFetch((url, init) => (init?.method === "DELETE" ? json({}, 500) : json({ reviews: [REVIEW, mine, { ...REVIEW, id: "r3" }] })))
    const { result } = renderHook(() => useLocationReviews("loc"))
    await waitFor(() => expect(result.current.status).toBe("ready"))
    await act(async () => void (await result.current.remove("m")))
    expect(result.current.reviews.map((r) => r.id)).toEqual(["r1", "m", "r3"])
  })
})

const state = (over: Partial<ReviewsState> = {}): ReviewsState => ({
  status: "ready",
  reviews: [REVIEW],
  count: 1,
  average: 4,
  reload: vi.fn(),
  add: vi.fn(async () => true),
  edit: vi.fn(async () => true),
  remove: vi.fn(async () => true),
  ...over,
})

describe("ReviewsSection", () => {
  it("summarizes the rating, or says there are none yet", () => {
    const { rerender } = render(<ReviewSummary reviews={state({ reviews: [REVIEW, REVIEW], count: 2, average: 4.5 })} />)
    expect(screen.getByText("4.5 · 2 reviews")).toBeInTheDocument()
    rerender(<ReviewSummary reviews={state({ reviews: [], count: 0, average: 0 })} />)
    expect(screen.getByText("No reviews yet")).toBeInTheDocument()
  })

  it("asks a signed-out viewer to log in", () => {
    render(<ReviewsSection kind="vending" reviews={state({ reviews: [], count: 0 })} username={null} />)
    expect(screen.getByText(/Be the first to review this vending machine/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login")
    expect(screen.queryByRole("form")).not.toBeInTheDocument()
  })

  it("posts a rating with optional text, and only once a rating is picked", async () => {
    const reviews = state()
    render(<ReviewsSection kind="vending" reviews={reviews} username="ash" />)
    const post = screen.getByRole("button", { name: "Post review" })
    expect(post).toBeDisabled()
    fireEvent.click(screen.getByRole("radio", { name: /4/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "Your review" }), { target: { value: "  Restocked Friday  " } })
    fireEvent.click(post)
    await waitFor(() => expect(reviews.add).toHaveBeenCalledWith({ rating: 4, text: "Restocked Friday" }, "ash"))
  })

  it("edits and deletes only the viewer's own reviews", async () => {
    const reviews = state({ reviews: [REVIEW, { ...REVIEW, id: "m", username: "ash", text: "Mine", mine: true }], count: 2 })
    render(<ReviewsSection kind="vending" reviews={reviews} username="ash" />)
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    const box = screen.getByRole("textbox", { name: "Your review" })
    expect(box).toHaveValue("Mine")
    expect(box).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(reviews.edit).toHaveBeenCalledWith("m", { rating: 4, text: "Mine" }))
    expect(box).toHaveFocus()
  })

  it("asks before deleting, and closes the edit when its review is deleted", async () => {
    const reviews = state({ reviews: [{ ...REVIEW, id: "m", username: "ash", text: "Mine", mine: true }], count: 1 })
    render(<ReviewsSection kind="vending" reviews={reviews} username="ash" placeName="QFC" />)
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    const dialog = screen.getByRole("dialog", { name: "Delete this review?" })
    expect(dialog).toHaveTextContent("Your rating for QFC will be removed.")
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(reviews.remove).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus())
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!)
    expect(reviews.remove).toHaveBeenCalledWith("m")
    expect(screen.getByRole("button", { name: "Post review" })).toBeInTheDocument()
  })
})

describe("timeAgo", () => {
  const now = new Date("2026-11-07T12:00:00Z")
  it("says how long ago, then the date", () => {
    expect(timeAgo("2026-11-07T11:59:30Z", now)).toBe("just now")
    expect(timeAgo("2026-11-07T11:15:00Z", now)).toBe("45 min ago")
    expect(timeAgo("2026-11-07T09:00:00Z", now)).toBe("3 hr ago")
    expect(timeAgo("2026-11-06T09:00:00Z", now)).toBe("1 day ago")
    expect(timeAgo("2026-10-01T09:00:00Z", now)).toBe("Oct 1")
    expect(timeAgo("2025-10-01T09:00:00Z", now)).toBe("Oct 1, 2025")
  })
})
