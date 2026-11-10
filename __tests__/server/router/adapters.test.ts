// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { FakeRouter } from "@/server/adapters/router/fake"
import { OpenRouteServiceRouter } from "@/server/adapters/router/openrouteservice"
import { RouterError, type RoutePoint } from "@/server/ports/router"

const STOPS: RoutePoint[] = [
  [-104.99, 39.74],
  [-105.02, 39.71],
  [-104.95, 39.68],
]

/** Answers every fetch with `body` and records the request. */
function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }))
  vi.stubGlobal("fetch", fetchMock)
  return () => {
    const [url, init] = fetchMock.mock.calls[0]
    return { url: new URL(String(url)), init: init!, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) }
  }
}

afterEach(() => vi.unstubAllGlobals())

const orsAnswer = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [-104.990001, 39.740002],
          [-104.9900012, 39.7400021],
          [-105.000004, 39.730004],
          [-105.020001, 39.710001],
          [-104.950001, 39.680001],
        ],
      },
      properties: {
        summary: { distance: 16093.44, duration: 1260 },
        segments: [
          { distance: 4828.032, duration: 420 },
          { distance: 11265.408, duration: 840 },
        ],
      },
    },
  ],
}

describe("OpenRouteServiceRouter", () => {
  it("asks api.heigit.org for a driving route through the stops in order, with the key in a header", async () => {
    const request = mockFetch(orsAnswer)
    const signal = new AbortController().signal
    await new OpenRouteServiceRouter("ors-secret").route(STOPS, { signal })
    const { url, init, headers, body } = request()
    expect(url.href).toBe("https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson")
    expect(init.method).toBe("POST")
    expect(init.signal).toBe(signal)
    expect(headers.get("Authorization")).toBe("ors-secret")
    expect(url.href).not.toContain("ors-secret")
    expect(body).toMatchObject({ coordinates: STOPS, instructions: false })
    expect(body.radiuses).toHaveLength(3)
  })

  it("keeps a self-hosted instance's path", async () => {
    const request = mockFetch(orsAnswer)
    await new OpenRouteServiceRouter("k", "https://ors.example.com/ors").route(STOPS)
    expect(request().url.href).toBe("https://ors.example.com/ors/v2/directions/driving-car/geojson")
  })

  it("returns the line, rounded and without repeated points, and miles and minutes per leg and in total", async () => {
    mockFetch(orsAnswer)
    expect(await new OpenRouteServiceRouter("k").route(STOPS)).toEqual({
      routed: true,
      line: {
        type: "LineString",
        coordinates: [
          [-104.99, 39.74],
          [-105, 39.73],
          [-105.02, 39.71],
          [-104.95, 39.68],
        ],
      },
      legs: [
        { miles: 3, minutes: 7 },
        { miles: 7, minutes: 14 },
      ],
      miles: 10,
      minutes: 21,
    })
  })

  it("throws a RouterError without the key on an error status", async () => {
    mockFetch({ error: { code: 2010, message: "Could not find routable point" } }, 404)
    const error = await new OpenRouteServiceRouter("ors-secret").route(STOPS).catch((e) => e)
    expect(error).toBeInstanceOf(RouterError)
    expect(error.status).toBe(404)
    expect(error.message).not.toContain("ors-secret")
  })

  it("turns a network failure, a non-JSON body or an unexpected answer into a RouterError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed https://api.heigit.org/?key=ors-secret"))))
    const offline = await new OpenRouteServiceRouter("ors-secret").route(STOPS).catch((e) => e)
    expect(offline).toBeInstanceOf(RouterError)
    expect(offline.message).not.toContain("ors-secret")
    for (const body of ["<html>", { features: [] }, { features: [{ ...orsAnswer.features[0], properties: { segments: [{ distance: 1, duration: 1 }] } }] }]) {
      mockFetch(body)
      await expect(new OpenRouteServiceRouter("k").route(STOPS)).rejects.toBeInstanceOf(RouterError)
    }
  })

  it("passes the caller's abort through as it is", async () => {
    const ctl = new AbortController()
    vi.stubGlobal("fetch", vi.fn(async () => {
      ctl.abort()
      throw new DOMException("This operation was aborted", "AbortError")
    }))
    const error = await new OpenRouteServiceRouter("k").route(STOPS, { signal: ctl.signal }).catch((e) => e)
    expect(error).not.toBeInstanceOf(RouterError)
    expect(error.name).toBe("AbortError")
  })
})

describe("FakeRouter", () => {
  it("draws straight lines with straight-line miles and no minutes, and never calls out", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const route = await new FakeRouter().route(STOPS)
    expect(route.routed).toBe(false)
    expect(route.line).toEqual({ type: "LineString", coordinates: STOPS })
    expect(route.legs).toHaveLength(2)
    expect(route.legs.every((l) => l.miles > 0 && l.minutes === null)).toBe(true)
    expect(route.miles).toBeCloseTo(route.legs[0].miles + route.legs[1].miles, 5)
    expect(route.minutes).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
