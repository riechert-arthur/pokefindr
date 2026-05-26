import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import Avatar from "@/components/ui/Avatar"
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

describe("Avatar", () => {
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
    render(<Avatar size={42} userName="misty" />)

    expect(screen.getByRole("button")).toHaveTextContent("m")
  })

  it("opens the menu and logs the user out", async () => {
    render(<Avatar size={42} userName="misty" />)

    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings"
    )

    fireEvent.click(screen.getByRole("button", { name: "Log out" }))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/api/auth/logout", {
        withCredentials: true,
      })
    })
    expect(postMessage).toHaveBeenCalledWith("logout")
    expect(mocks.refresh).toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith("/login")
  })
})
