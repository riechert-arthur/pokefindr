import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "../../helpers/intl"
import { useStateShading } from "@/components/map/useStateShading"
import type { LocationKind } from "@/lib/types/locations"

const OUTLINES = { type: "FeatureCollection", features: [] }
const COUNTS = [{ country: "US", region: "WA", kind: "vending", count: 41 }]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("useStateShading", () => {
  it("drops the old filter's counts when the new ones fail to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("retailer=")) return new Response("", { status: 500 })
        if (url.includes("aggregates")) return new Response(JSON.stringify({ counts: COUNTS }))
        return new Response(JSON.stringify(OUTLINES))
      }),
    )
    const kinds = new Set<LocationKind>(["vending"])
    const { result, rerender } = renderHook(({ retailers }) => useStateShading(kinds, retailers), {
      initialProps: { retailers: null as string[] | null },
    })
    await waitFor(() => expect(result.current.total).toBe(41))
    rerender({ retailers: ["Safeway"] })
    await waitFor(() => expect(result.current.total).toBeNull())
  })
})
