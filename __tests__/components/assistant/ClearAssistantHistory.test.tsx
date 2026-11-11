import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "../../helpers/intl"
import { ClearAssistantHistory } from "@/components/assistant/ClearAssistantHistory"
import { loadChat, saveChat } from "@/lib/assistant/saved-chat"

const { toast } = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock("sonner", () => ({ toast }))

const chat = [{ id: 1, role: "user" as const, text: "hi" }]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  localStorage.clear()
  loadChat("reset")
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

  it("also removes the current chat kept in this browser (#346), but not when the server couldn't clear", async () => {
    saveChat("u1", chat)
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })))
    render(<ClearAssistantHistory />)
    fireEvent.click(screen.getByRole("button", { name: "Clear assistant history" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(loadChat("u1")).toEqual(chat)

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ deleted: 1 }))))
    fireEvent.click(screen.getByRole("button", { name: "Clear assistant history" }))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(loadChat("u1")).toEqual([])
  })

  it("says when it couldn't", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })))
    render(<ClearAssistantHistory />)
    fireEvent.click(screen.getByRole("button", { name: "Clear assistant history" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't clear your history", expect.anything()))
  })
})
