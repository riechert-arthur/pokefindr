import { afterEach, describe, expect, it, vi } from "vitest"
import { cameraPadding } from "@/components/map/camera"

const phone = (panel: number) => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }))
  const el = document.createElement("div")
  el.style.setProperty("--map-panel-h", `${panel}px`)
  Object.defineProperty(el, "clientHeight", { value: 700 })
  return el
}
afterEach(() => vi.unstubAllGlobals())

describe("cameraPadding", () => {
  it("on phones reserves the panel's 55% cap only for fits that open a list", () => {
    const el = phone(110)
    expect(cameraPadding(el, { sheet: true }).bottom).toBe(385 + 16)
    // A state or the US: the panel stays as tall as it is.
    expect(cameraPadding(el).bottom).toBe(110 + 16)
  })

  it("keeps the column clear on desktop", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q }))
    expect(cameraPadding(null, { sheet: true })).toEqual({ top: 104, bottom: 60, left: 400, right: 60 })
  })
})
