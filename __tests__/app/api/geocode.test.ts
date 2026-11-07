// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))
const search = vi.fn()
vi.mock("@/server/container", () => ({ getGeocoder: () => ({ search }) }))

import { GET } from "@/app/api/geocode/route"
import { GeocoderError } from "@/server/ports/geocoder"

let ip = 0
/** Each test gets its own IP, so the rate limit test doesn't leak into the others. */
const get = (query: string, from = `10.0.0.${++ip}`) =>
  GET(new NextRequest(`http://localhost/api/geocode?${query}`, { headers: { "x-forwarded-for": `${from}, 10.1.1.1` } }))

beforeEach(() => {
  search.mockReset()
  search.mockResolvedValue([{ label: "Denver, CO", lng: -104.99, lat: 39.74, kind: "city", state: "CO" }])
})

describe("GET /api/geocode", () => {
  it("returns the geocoder's results with a day of CDN cache", async () => {
    const res = await get("q=Denver&near=-105.0,39.7&limit=3")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [{ label: "Denver, CO", lng: -104.99, lat: 39.74, kind: "city", state: "CO" }] })
    expect(res.headers.get("cache-control")).toContain("s-maxage=86400")
    expect(search).toHaveBeenCalledWith("Denver", expect.objectContaining({ near: [-105, 39.7], limit: 3 }))
  })

  it.each([
    ["no query", ""],
    ["a one-letter query", "q=D"],
    ["a query over 200 characters", `q=${"a".repeat(201)}`],
    ["near out of range", "q=Denver&near=200,40"],
    ["near in scientific notation", "q=Denver&near=1e2,40"],
    ["a limit over 10", "q=Denver&limit=50"],
  ])("rejects %s with 400", async (_, query) => {
    const res = await get(query)
    expect(res.status).toBe(400)
    expect(search).not.toHaveBeenCalled()
  })

  it("limits each IP, with Retry-After", async () => {
    const statuses: number[] = []
    for (let i = 0; i < 21; i++) statuses.push((await get("q=Denver", "192.0.2.1")).status)
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true)
    const limited = await get("q=Denver", "192.0.2.1")
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("60")
    // Someone else is unaffected.
    expect((await get("q=Denver", "192.0.2.2")).status).toBe(200)
  })

  it("answers 502 without provider details when the geocoder fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    search.mockRejectedValue(new GeocoderError("Mapbox geocoding failed with status 401", 401))
    const res = await get("q=Denver")
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: "Search is unavailable right now" })
    expect(res.headers.get("cache-control")).toBeNull()
  })

  it("answers 503 when the provider rate-limits us", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    search.mockRejectedValue(new GeocoderError("Photon geocoding failed with status 429", 429))
    expect((await get("q=Denver")).status).toBe(503)
  })
})
