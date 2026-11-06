import { afterEach, describe, expect, it, vi } from "vitest"
import { broadcastAuth } from "@/lib/auth/broadcast"

afterEach(() => vi.unstubAllGlobals())

describe("broadcastAuth", () => {
  it("posts on the auth channel and closes it", () => {
    const channel = { postMessage: vi.fn(), close: vi.fn() }
    const ctor = vi.fn(() => channel)
    vi.stubGlobal("BroadcastChannel", ctor)
    broadcastAuth("login")
    expect(ctor).toHaveBeenCalledWith("auth")
    expect(channel.postMessage).toHaveBeenCalledWith("login")
    expect(channel.close).toHaveBeenCalled()
  })

  it("does nothing where BroadcastChannel isn't available", () => {
    vi.stubGlobal("BroadcastChannel", undefined)
    expect(() => broadcastAuth("logout")).not.toThrow()
  })
})
