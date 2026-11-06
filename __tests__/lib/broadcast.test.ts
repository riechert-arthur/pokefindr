import { afterEach, describe, expect, it, vi } from "vitest"
import { broadcastAuth, subscribeAuth } from "@/lib/auth/broadcast"

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

  it("subscribes to login and logout messages only, and unsubscribes by closing", () => {
    const channel: { onmessage?: (e: { data: unknown }) => void; close: () => void } = { close: vi.fn() }
    vi.stubGlobal("BroadcastChannel", vi.fn(() => channel))
    const onMessage = vi.fn()
    const unsubscribe = subscribeAuth(onMessage)
    channel.onmessage?.({ data: "login" })
    channel.onmessage?.({ data: "something else" })
    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith("login")
    unsubscribe()
    expect(channel.close).toHaveBeenCalled()
  })

  it("subscribes to nothing where BroadcastChannel isn't available", () => {
    vi.stubGlobal("BroadcastChannel", undefined)
    expect(() => subscribeAuth(() => {})()).not.toThrow()
  })
})
