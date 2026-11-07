import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useNearbyLocations } from "@/components/map/useNearbyLocations"

const body = (total: number) => ({ type: "FeatureCollection", features: [], counts: { vending: total }, total, truncated: false })

afterEach(() => vi.unstubAllGlobals())

describe("useNearbyLocations", () => {
  it("asks for the place's radius, kinds and retailers", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body(41))))
    vi.stubGlobal("fetch", fetchMock)
    const { result } = renderHook(() => useNearbyLocations({ lng: -122.32851, lat: 47.61962, radius: 10 }, ["vending"], ["QFC", "Safeway"]))
    await waitFor(() => expect(result.current.status).toBe("ready"))
    expect(result.current.results?.total).toBe(41)
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), "http://localhost")
    expect(Object.fromEntries(url.searchParams)).toEqual({ lng: "-122.3285", lat: "47.6196", r: "10", types: "vending", retailer: "QFC,Safeway" })
  })

  it("ignores a late answer for a radius the viewer already changed", async () => {
    const answers: ((r: Response) => void)[] = []
    vi.stubGlobal("fetch", vi.fn((_: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      answers.push(resolve)
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
    })))
    const kinds = ["vending", "shop", "event"] as const
    const { result, rerender } = renderHook(({ r }) => useNearbyLocations({ lng: 0, lat: 0, radius: r }, kinds, null), { initialProps: { r: 10 } })
    rerender({ r: 25 })
    await act(async () => answers[1](new Response(JSON.stringify(body(99)))))
    await act(async () => answers[0](new Response(JSON.stringify(body(1)))))
    await waitFor(() => expect(result.current.status).toBe("ready"))
    expect(result.current.results?.total).toBe(99)
  })

  it("is idle without a place, and retries after an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }))
    vi.stubGlobal("fetch", fetchMock)
    const kinds = ["vending"] as const
    const { result, rerender } = renderHook(({ on }) => useNearbyLocations(on ? { lng: 0, lat: 0, radius: 5 } : null, kinds, null), { initialProps: { on: false } })
    expect(result.current.status).toBe("idle")
    rerender({ on: true })
    await waitFor(() => expect(result.current.status).toBe("error"))
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(body(3))))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe("ready"))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
