import { afterEach, describe, expect, it, vi } from "vitest"
import { render } from "../helpers/intl"

const { vercelTrack } = vi.hoisted(() => ({ vercelTrack: vi.fn() }))
vi.mock("@vercel/analytics", () => ({ track: vercelTrack }))
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => <span data-testid="vercel-analytics" /> }))
vi.mock("next/script", () => ({ default: (props: Record<string, string>) => <script data-testid="script" {...props} /> }))

import { analyticsProviderOf } from "@/config.public"
import { flushUmami, sendEvent } from "@/lib/analytics"
import { Analytics } from "@/components/Analytics"

afterEach(() => {
  vi.clearAllMocks()
  delete window.plausible
  delete window.umami
  const w = window as unknown as { va?: unknown; vaq?: unknown }
  delete w.va
  delete w.vaq
})

describe("analyticsProviderOf", () => {
  it("reads the provider, and is none when unset or unknown", () => {
    expect(analyticsProviderOf("vercel")).toBe("vercel")
    expect(analyticsProviderOf(" Plausible ")).toBe("plausible")
    expect(analyticsProviderOf(undefined)).toBe("none")
    expect(analyticsProviderOf("")).toBe("none")
    expect(analyticsProviderOf("google")).toBe("none")
  })
})

describe("sendEvent", () => {
  it("sends to Vercel, with a queue for events sent before its script is injected", () => {
    sendEvent("vercel", "search", { kind: "city" })
    expect(vercelTrack).toHaveBeenCalledWith("search", { kind: "city" })
    // The stub is the library's own: the script reads window.vaq once it loads.
    const w = window as unknown as { va: (...a: unknown[]) => void; vaq?: unknown[][] }
    w.va("event", { name: "search" })
    expect(w.vaq).toEqual([["event", { name: "search" }]])
  })

  it("queues for Plausible until its script loads, then the script reads the queue", () => {
    sendEvent("plausible", "search", { kind: "city" })
    expect(window.plausible?.q).toEqual([["search", { props: { kind: "city" } }]])
    const loaded = vi.fn()
    window.plausible = loaded
    sendEvent("plausible", "details_open")
    expect(loaded).toHaveBeenCalledWith("details_open", undefined)
  })

  it("holds Umami events until its script is ready, then sends them in order", () => {
    sendEvent("umami", "search", { kind: "city" })
    sendEvent("umami", "details_open")
    const track = vi.fn()
    window.umami = { track }
    expect(track).not.toHaveBeenCalled()
    flushUmami()
    expect(track.mock.calls).toEqual([
      ["search", { kind: "city" }],
      ["details_open", undefined],
    ])
    sendEvent("umami", "directions_click")
    expect(track).toHaveBeenLastCalledWith("directions_click", undefined)
  })

  it("sends nothing for none, and never throws", () => {
    sendEvent("none", "search")
    expect(vercelTrack).not.toHaveBeenCalled()
    vercelTrack.mockImplementationOnce(() => {
      throw new Error("blocked")
    })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(() => sendEvent("vercel", "search")).not.toThrow()
    warn.mockRestore()
  })
})

describe("Analytics", () => {
  it("renders the configured provider's tracker, or nothing", () => {
    expect(render(<Analytics config={{ provider: "none", site: undefined, scriptUrl: undefined }} />).container.innerHTML).toBe("")
    expect(render(<Analytics config={{ provider: "vercel", site: undefined, scriptUrl: undefined }} />).getByTestId("vercel-analytics")).toBeTruthy()
    const plausible = render(<Analytics config={{ provider: "plausible", site: "pokefindr.app", scriptUrl: undefined }} />).getByTestId("script")
    expect(plausible.getAttribute("data-domain")).toBe("pokefindr.app")
    expect(plausible.getAttribute("src")).toBe("https://plausible.io/js/script.js")
    const umami = render(<Analytics config={{ provider: "umami", site: "abc-123", scriptUrl: "https://stats.example/script.js" }} />).getAllByTestId("script").at(-1)!
    expect(umami.getAttribute("data-website-id")).toBe("abc-123")
    expect(umami.getAttribute("src")).toBe("https://stats.example/script.js")
    // Plausible and Umami need a site.
    expect(render(<Analytics config={{ provider: "umami", site: undefined, scriptUrl: undefined }} />).container.innerHTML).toBe("")
  })
})
