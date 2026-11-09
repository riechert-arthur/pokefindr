import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { message, render, screen } from "../../helpers/intl"
import { classifyMapError, MapErrorBoundary } from "@/components/map/MapErrorBoundary"

const failure = (key: "library" | "webgl" | "crash") => message()(`map.failure.${key}`)

vi.mock("next/dynamic", () => ({
  default: () => () => <div>map</div>,
}))

function Throws({ error }: { error: Error }): React.ReactNode {
  throw error
}

describe("classifyMapError", () => {
  it.each([
    [Object.assign(new Error("Loading chunk 123 failed."), { name: "ChunkLoadError" }), "library"],
    [new TypeError("Failed to fetch dynamically imported module: /_next/static/chunks/map.js"), "library"],
    [new Error("Failed to initialize WebGL"), "webgl"],
    [new Error("Cannot read properties of undefined"), "crash"],
    ["a string", "crash"],
  ])("sorts %s as %s", (error, failure) => {
    expect(classifyMapError(error)).toBe(failure)
  })
})

describe("MapErrorBoundary", () => {
  afterEach(() => vi.restoreAllMocks())

  it("renders its children when nothing fails", () => {
    render(<MapErrorBoundary>fine</MapErrorBoundary>)
    expect(screen.getByText("fine")).toBeTruthy()
  })

  it("replaces a crashed map with a message and a reload button", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      <MapErrorBoundary>
        <Throws error={new Error("Failed to initialize WebGL")} />
      </MapErrorBoundary>,
    )
    expect(screen.getByRole("alert").textContent).toContain(failure("webgl"))
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy()
  })
})

describe("MapLoader", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("explains that the map needs WebGL instead of trying to start it", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    const { MapLoader } = await import("@/components/map/MapLoader")
    render(<MapLoader />)
    expect(screen.getByRole("alert").textContent).toContain(failure("webgl"))
    expect(screen.queryByText("map")).toBeNull()
  })

  it("starts the map when WebGL is available", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as RenderingContext)
    const { MapLoader } = await import("@/components/map/MapLoader")
    render(<MapLoader />)
    expect(screen.getByText("map")).toBeTruthy()
  })
})
