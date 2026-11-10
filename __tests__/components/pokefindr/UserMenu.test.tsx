import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "../../helpers/intl"
import { UserMenu } from "@/components/pokefindr/UserMenu"
import axios from "axios"
import { toast } from "sonner"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
}))

vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({
    refresh: mocks.refresh,
    push: mocks.push,
  }),
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}))

describe("UserMenu", () => {
  const postMock = vi.mocked(axios.post)
  const postMessage = vi.fn()
  const close = vi.fn()

  beforeEach(() => {
    postMock.mockResolvedValue({})
    vi.stubGlobal(
      "BroadcastChannel",
      vi.fn(() => ({
        postMessage,
        close,
      }))
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it("renders the first initial when no image is provided", () => {
    render(<UserMenu userName="misty" />)

    expect(screen.getByRole("button", { name: "Account menu for misty" })).toHaveTextContent("M")
  })

  it("opens the menu and logs the user out", async () => {
    render(<UserMenu userName="misty" />)

    // Radix menus open from the keyboard (or pointerdown), not a synthetic click.
    fireEvent.keyDown(screen.getByRole("button", { name: "Account menu for misty" }), { key: "Enter" })
    expect(await screen.findByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings")

    fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }))

    // Everything after the awaited POST runs asynchronously, so wait for all of it.
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/api/auth/logout", undefined, {
        withCredentials: true,
      })
      expect(postMessage).toHaveBeenCalledWith("logout")
      expect(close).toHaveBeenCalled()
      expect(mocks.refresh).toHaveBeenCalled()
      expect(mocks.push).toHaveBeenCalledWith("/login")
    })
  })

  it("shows an error and stays put when logout fails", async () => {
    postMock.mockRejectedValue(new Error("500"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<UserMenu userName="misty" variant="list" />)

    fireEvent.click(screen.getByRole("button", { name: "Log out" }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(mocks.push).not.toHaveBeenCalled()
    expect(postMessage).not.toHaveBeenCalled()
  })

  it("lays out Settings and Log out inline in the list variant", () => {
    render(<UserMenu userName="misty" variant="list" />)

    expect(screen.queryByRole("button", { name: /Account menu/ })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings")
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument()
    expect(screen.getByText("misty")).toBeInTheDocument()
  })

  it("sends one logout request when Log out is clicked twice", async () => {
    let resolve!: () => void
    postMock.mockReturnValue(new Promise((r) => { resolve = () => r({}) }))
    render(<UserMenu userName="misty" variant="list" />)

    const button = screen.getByRole("button", { name: "Log out" })
    fireEvent.click(button)
    fireEvent.click(button)
    resolve()

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/login"))
    expect(postMock).toHaveBeenCalledTimes(1)
  })
})
