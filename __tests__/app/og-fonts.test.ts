// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { ogFonts, ttfUrls } from "@/app/og-fonts"

const CSS = ["500", "700", "800"]
  .map((w) => `@font-face {\n  font-family: 'Noto Sans';\n  font-weight: ${w};\n  src: url(https://fonts.gstatic.com/n${w}.ttf) format('truetype');\n}`)
  .join("\n")

afterEach(() => vi.unstubAllGlobals())

describe("og-fonts", () => {
  it("reads one TTF URL per weight from a single css2 response", () => {
    expect([...ttfUrls(CSS)]).toEqual([
      [500, "https://fonts.gstatic.com/n500.ttf"],
      [700, "https://fonts.gstatic.com/n700.ttf"],
      [800, "https://fonts.gstatic.com/n800.ttf"],
    ])
  })

  it("loads all three weights with one CSS request", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes("css2") ? new Response(CSS) : new Response(new ArrayBuffer(4)),
    )
    vi.stubGlobal("fetch", fetch)
    const fonts = await ogFonts()
    expect(fonts.map((f) => f.weight)).toEqual([500, 700, 800])
    expect(fetch.mock.calls.filter(([u]) => String(u).includes("css2"))).toHaveLength(1)
  })

  it("falls back to the default font on an error response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })))
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(await ogFonts()).toEqual([])
  })

  it("passes a timeout signal so a stalled request can't hang the build", async () => {
    const fetch = vi.fn(async () => new Response(CSS))
    vi.stubGlobal("fetch", fetch)
    vi.spyOn(console, "warn").mockImplementation(() => {})
    await ogFonts()
    expect((fetch.mock.calls[0] as unknown[])[1]).toMatchObject({ signal: expect.any(AbortSignal) })
  })
})
