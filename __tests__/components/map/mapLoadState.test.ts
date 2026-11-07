import { describe, expect, it } from "vitest"
import { INITIAL_LOAD_STATE, nextLoadState, type MapLoadState } from "@/components/map/mapLoadState"

const run = (...events: Parameters<typeof nextLoadState>[1][]) =>
  events.reduce<MapLoadState>((state, event) => nextLoadState(state, event), INITIAL_LOAD_STATE)

describe("nextLoadState", () => {
  it("is loaded once MapLibre fires load", () => {
    expect(run({ type: "load" })).toEqual({ status: "loaded" })
  })

  it("keeps loading through a tile error before load, then loads", () => {
    const tileError = { type: "error" as const, error: new Error("AJAXError: Not Found (404)"), sourceId: "openmaptiles", tile: {} }
    expect(run(tileError)).toEqual({ status: "loading" })
    expect(run(tileError, { type: "load" })).toEqual({ status: "loaded" })
  })

  it("fails when the style doesn't arrive, with the 'didn't load' message", () => {
    expect(run({ type: "error", error: new TypeError("Failed to fetch") })).toEqual({ status: "failed", failure: "library" })
  })

  it("names WebGL when MapLibre can't create the map", () => {
    // react-maplibre reports this through onError; it never reaches the error boundary.
    expect(run({ type: "error", error: new Error("Failed to initialize WebGL") })).toEqual({ status: "failed", failure: "webgl" })
  })

  it("only logs errors after load", () => {
    expect(run({ type: "load" }, { type: "error", error: new Error("style broke") })).toEqual({ status: "loaded" })
  })

  it("keeps the first failure", () => {
    const failed = run({ type: "error", error: new Error("Failed to initialize WebGL") }, { type: "error", error: new Error("x") })
    expect(failed).toEqual({ status: "failed", failure: "webgl" })
  })
})
