import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { UserMenu } from "@/components/pokefindr/UserMenu"
import axios from "axios"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    push: mocks.push,
  }),
}))

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}))

describe("UserMenu", () => {
  const postMock = vi.mocked(axios.post)
  const postMessage = vi.fn()

  beforeEach(() => {
    postMock.mockResolvedValue({})
    vi.stubGlobal(
      "BroadcastChannel",
      vi.fn(() => ({
        postMessage,
      }))
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it("renders the first initial when no image is provided", () => {
    render(<UserMenu size={42} userName="misty" />)

    expect(screen.getByRole("button", { name: "Account menu for misty" })).toHaveTextContent("m")
  })

  it("opens the menu and logs the user out", async () => {
    render(<UserMenu size={42} userName="misty" />)

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
      expect(mocks.refresh).toHaveBeenCalled()
      expect(mocks.push).toHaveBeenCalledWith("/login")
    })
  })
})
