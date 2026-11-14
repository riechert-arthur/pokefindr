import { afterEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { cleanup, fireEvent, render, screen, waitFor, within } from "../../helpers/intl"
import { HeldReviews } from "@/components/admin/HeldReviews"
import { RefreshSummary } from "@/components/admin/useRefreshSummary"
import type { HeldReview } from "@/lib/reviews/moderation"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock("@/components/providers/SessionProvider", () => ({ useSessionContext: () => ({ session: { role: "moderator" } }) }))

const review = (over: Partial<HeldReview> = {}): HeldReview => ({
  id: "r1",
  rating: 2,
  text: "Empty every time",
  status: "held",
  author: "brock",
  writtenByViewer: false,
  createdAt: new Date(Date.now() - 3600_000).toISOString(),
  location: { id: "loc1", name: "King Soopers", city: "Denver", state: "CO", kind: "vending" },
  check: { verdict: "hold", categories: [], reason: "Might be spam", model: "m", failed: false, at: new Date().toISOString() },
  moderatedBy: null,
  moderatedAt: null,
  ...over,
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

/** Answers the list with `held`, and each action with `action` (status and body). */
function serve(held: HeldReview[], action: { status: number; body: unknown } = { status: 200, body: { ok: true } }) {
  const calls: { url: string; body?: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (init?.method === "POST") return new Response(JSON.stringify(action.body), { status: action.status })
      return new Response(JSON.stringify({ held, decided: [] }))
    }),
  )
  return calls
}

describe("HeldReviews", () => {
  it("approves a held review, then refreshes the list and the admin's counts", async () => {
    const calls = serve([review()])
    const refreshSummary = vi.fn()
    render(
      <RefreshSummary.Provider value={refreshSummary}>
        <HeldReviews />
      </RefreshSummary.Provider>,
    )
    const item = (await screen.findByText("King Soopers")).closest("li")!
    fireEvent.click(within(item).getByRole("button", { name: "Approve" }))
    await waitFor(() => expect(refreshSummary).toHaveBeenCalled())
    expect(calls.find((c) => c.url === "/api/admin/reviews/r1")?.body).toEqual({ action: "approve" })
    expect(calls.filter((c) => c.url === "/api/admin/reviews")).toHaveLength(2)
    expect(toast.success).toHaveBeenCalledWith("brock's review is published", expect.anything())
  })

  it("shows the server's reason when it refuses", async () => {
    serve([review()], { status: 409, body: { error: "Someone already decided this one" } })
    render(<HeldReviews />)
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Someone already decided this one"))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("doesn't offer a decision on the moderator's own review", async () => {
    serve([review({ writtenByViewer: true })])
    render(<HeldReviews />)
    expect(await screen.findByText(/another moderator has to review it/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull()
  })

  it("offers a retry when the list doesn't load", async () => {
    let fail = true
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (fail ? new Response("", { status: 500 }) : new Response(JSON.stringify({ held: [], decided: [] })))),
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<HeldReviews />)
    expect(await screen.findByText("Couldn't load reviews")).toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("No held reviews")).toBeInTheDocument()
  })
})
