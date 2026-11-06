// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "../..")
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8")
const mark = read("public/brand/mark.svg")

/** The mark's geometry: every path `d` and rect position/size, in order. */
const geometry = (svg: string) => [
  ...[...svg.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]),
  ...[...svg.matchAll(/<rect\b[^>]*?x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)].map((m) => m.slice(1).join(",")),
]

// The mark lives in several files because each consumer needs a different
// form (themed React, static SVG, favicon). These checks keep them in sync.
describe("brand mark copies", () => {
  it("has some geometry to compare", () => {
    expect(geometry(mark).length).toBeGreaterThan(4)
  })

  it("uses the same SVG for the favicon as public/brand/mark.svg", () => {
    expect(read("src/app/icon.svg")).toBe(mark)
  })

  it.each(["src/components/brand/Logo.tsx", "public/brand/wordmark.svg"])("draws the same mark in %s", (file) => {
    const other = geometry(read(file))
    for (const shape of geometry(mark)) expect(other, shape).toContain(shape)
  })

  it("builds generated images from public/brand/mark.svg", () => {
    expect(read("src/app/brand-mark.ts")).toContain('"public/brand/mark.svg"')
  })
})
