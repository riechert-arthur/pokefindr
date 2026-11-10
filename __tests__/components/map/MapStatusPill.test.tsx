import { describe, expect, it } from "vitest"
import { formatFor, render, screen, translator } from "../../helpers/intl"
import { MapStatusPill, statusText } from "@/components/map/MapStatusPill"

const f = formatFor()
const t = translator("map.status")

const base = { zoomedOut: false, total: 1457, inView: 0, truncated: false, kinds: ["vending", "shop", "event"] as const }

describe("map status pill", () => {
  it("puts the plus on the number of a capped count", () => {
    expect(f.places(2000, base.kinds, true)).toBe("2,000+ places")
    expect(f.places(2000, ["vending"], true)).toBe("2,000+ vending machines")
  })

  it("says loading until this view has loaded, not 'loaded for this area'", () => {
    expect(statusText({ ...base, status: "idle" }, f, t)).toBe("Loading this area…")
    expect(statusText({ ...base, status: "loading", inView: 12 }, f, t)).toBe("12 places in view · updating…")
    expect(statusText({ ...base, status: "ready", inView: 12 }, f, t)).toBe("12 places in view · loaded for this area")
    expect(statusText({ ...base, status: "ready", inView: 2000, truncated: true }, f, t)).toBe("2,000+ places in view · zoom in to see them all")
  })

  it("announces only settled results to screen readers", () => {
    const { rerender } = render(<MapStatusPill {...base} status="loading" inView={12} />)
    expect(screen.getByRole("status").textContent).toBe("")
    rerender(<MapStatusPill {...base} status="ready" inView={14} />)
    expect(screen.getByRole("status").textContent).toBe("14 places in view · loaded for this area")
  })
})
