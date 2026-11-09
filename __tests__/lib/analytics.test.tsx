import { afterEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

const { vercelTrack } = vi.hoisted(() => ({ vercelTrack: vi.fn() }))
vi.mock("@vercel/analytics", () => ({ track: vercelTrack }))
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => <span data-testid="vercel-analytics" /> }))
vi.mock("next/script", () => ({ default: (props: Record<string, string>) => <script data-testid="script" {...props} /> }))

import { analyticsProviderOf } from "@/config.public"
import { sendEvent } from "@/lib/analytics"
import { Analytics } from "@/components/Analytics"

afterEach(() => {
  vi.clearAllMocks()
  delete window.plausible
  delete window.umami
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
  it("sends to Vercel", () => {
    sendEvent("vercel", "search", { kind: "city" })
    expect(vercelTrack).toHaveBeenCalledWith("search", { kind: "city" })
  })

  it("queues for Plausible until its script loads, then the script reads the queue", () => {
    sendEvent("plausible", "search", { kind: "city" })
    expect(window.plausible?.q).toEqual([["search", { props: { kind: "city" } }]])
    const loaded = vi.fn()
    window.plausible = loaded
    sendEvent("plausible", "details_open")
    expect(loaded).toHaveBeenCalledWith("details_open", undefined)
  })

  it("sends to Umami when its script is there, and does nothing when it isn't", () => {
    sendEvent("umami", "search")
    const track = vi.fn()
    window.umami = { track }
    sendEvent("umami", "search", { kind: "city" })
    expect(track).toHaveBeenCalledWith("search", { kind: "city" })
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
