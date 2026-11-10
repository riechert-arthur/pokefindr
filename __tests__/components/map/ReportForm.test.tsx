import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "../../helpers/intl"
import { ReportForm } from "@/components/map/ReportForm"

const { toast } = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock("sonner", () => ({ toast }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe("ReportForm", () => {
  it("asks a signed-out viewer to log in", () => {
    render(<ReportForm locationId="a" kind="vending" signedIn={false} onClose={vi.fn()} />)
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login")
  })

  it("sends the picked reason (and a comment for 'Something else'), thanks, and closes", async () => {
    const fetchMock = vi.fn(async () => json({ success: true, duplicate: false }))
    vi.stubGlobal("fetch", fetchMock)
    const onClose = vi.fn()
    render(<ReportForm locationId="loc-1" kind="vending" signedIn onClose={onClose} />)
    expect(screen.getByText("What's wrong with this vending machine?")).toBeInTheDocument()
    const send = screen.getByRole("button", { name: "Send report" })
    expect(send).toBeDisabled()
    fireEvent.click(screen.getByRole("radio", { name: "Something else" }))
    fireEvent.change(screen.getByRole("textbox", { name: "What's wrong? (optional)" }), { target: { value: " Moved inside " } })
    fireEvent.click(send)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith("/api/locations/loc-1/reports", expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "other", comment: "Moved inside" }) }))
    expect(toast.success).toHaveBeenCalledWith("Report sent", { description: 'Thanks. We\'ll check "something else" for this vending machine.' })
  })

  it("says so when already reported today or past the limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ success: true, duplicate: true })))
    const { unmount } = render(<ReportForm locationId="a" kind="vending" signedIn onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("radio", { name: "It's gone or was removed" }))
    fireEvent.click(screen.getByRole("button", { name: "Send report" }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Already reported", expect.anything()))
    unmount()
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 429)))
    const onClose = vi.fn()
    render(<ReportForm locationId="a" kind="vending" signedIn onClose={onClose} />)
    fireEvent.click(screen.getByRole("radio", { name: "Empty for a long time" }))
    fireEvent.click(screen.getByRole("button", { name: "Send report" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Too many reports today", expect.anything()))
    expect(onClose).not.toHaveBeenCalled()
  })

  it("asks to log in again when the session has ended", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Log in to continue" }, 401)))
    render(<ReportForm locationId="a" kind="vending" signedIn onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("radio", { name: "Empty for a long time" }))
    fireEvent.click(screen.getByRole("button", { name: "Send report" }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't send your report", { description: "Your session ended. Log in again and retry." }),
    )
  })
})
