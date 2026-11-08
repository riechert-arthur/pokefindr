import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ClearAssistantHistory } from "@/components/assistant/ClearAssistantHistory"

const { toast } = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock("sonner", () => ({ toast }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("ClearAssistantHistory", () => {
  it("deletes the history and says so", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ deleted: 3 })))
    vi.stubGlobal("fetch", fetchMock)
    render(<ClearAssistantHistory />)
    fireEvent.click(screen.getByRole("button", { name: "Clear assistant history" }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Assistant history cleared", expect.anything()))
    expect(fetchMock).toHaveBeenCalledWith("/api/assistant/history", { method: "DELETE" })
  })

  it("says when it couldn't", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })))
    render(<ClearAssistantHistory />)
    fireEvent.click(screen.getByRole("button", { name: "Clear assistant history" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't clear your history", expect.anything()))
  })
})
