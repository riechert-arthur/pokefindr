import { afterEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { cleanup, fireEvent, render, screen, waitFor } from "../../helpers/intl"
import { ReviewQueue } from "@/components/admin/ReviewQueue"
import { RefreshSummary } from "@/components/admin/useRefreshSummary"
import type { ModerationItem } from "@/lib/submissions/moderation"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock("@/components/providers/SessionProvider", () => ({ useSessionContext: () => ({ session: { role: "moderator" } }) }))
// The map preview needs WebGL; the queue's behavior doesn't.
vi.mock("@/components/map/engine", () => ({ Map: () => null, Marker: () => null, MAP_STYLES: { light: "", dark: "" } }))

const item = (over: Partial<ModerationItem> = {}): ModerationItem => ({
  id: "s1",
  kind: "shop",
  status: "pending",
  rejectReason: null,
  fields: { name: "Card Kingdom", address: "1 Main St", city: "Seattle", state: "WA" },
  lng: -122.3,
  lat: 47.6,
  submittedBy: "misty",
  reviewedBy: null,
  createdAt: new Date(Date.now() - 3600_000).toISOString(),
  reviewedAt: null,
  locationId: null,
  checks: [],
  sentByViewer: false,
  ...over,
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

/** Answers the queue with `queue`, and each decision with `action` (status and body). */
function serve(queue: ModerationItem[], action: { status: number; body: unknown } = { status: 200, body: { ok: true } }) {
  const calls: { url: string; body?: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (init?.method === "POST") return new Response(JSON.stringify(action.body), { status: action.status })
      return new Response(JSON.stringify({ queue, decided: [] }))
    }),
  )
  return calls
}

describe("ReviewQueue", () => {
  it("approves the selected submission, then refreshes the queue and the admin's counts", async () => {
    const calls = serve([item()])
    const refreshSummary = vi.fn()
    render(
      <RefreshSummary.Provider value={refreshSummary}>
        <ReviewQueue />
      </RefreshSummary.Provider>,
    )
    fireEvent.click(await screen.findByRole("button", { name: "Approve and publish" }))
    await waitFor(() => expect(refreshSummary).toHaveBeenCalled())
    expect(calls.find((c) => c.url === "/api/admin/submissions/s1")?.body).toEqual({ action: "approve" })
    expect(calls.filter((c) => c.url === "/api/admin/submissions")).toHaveLength(2)
    expect(toast.success).toHaveBeenCalledWith("Card Kingdom is on the map", expect.anything())
  })

  it("shows the server's reason when it refuses, and reloads the queue", async () => {
    const calls = serve([item()], { status: 409, body: { error: "Someone already decided this one" } })
    const refreshSummary = vi.fn()
    render(
      <RefreshSummary.Provider value={refreshSummary}>
        <ReviewQueue />
      </RefreshSummary.Provider>,
    )
    fireEvent.click(await screen.findByRole("button", { name: "Approve and publish" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Someone already decided this one"))
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/admin/submissions")).toHaveLength(2))
    expect(toast.success).not.toHaveBeenCalled()
    expect(refreshSummary).not.toHaveBeenCalled()
  })

  it("says so when the account can't moderate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })))
    render(<ReviewQueue />)
    expect(await screen.findByText("Moderators only")).toBeInTheDocument()
  })

  it("offers a retry when the queue doesn't load", async () => {
    let fail = true
    vi.stubGlobal("fetch", vi.fn(async () => (fail ? new Response("", { status: 500 }) : new Response(JSON.stringify({ queue: [], decided: [] })))))
    render(<ReviewQueue />)
    expect(await screen.findByText("Couldn't load the queue")).toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Nothing to review")).toBeInTheDocument()
  })
})
