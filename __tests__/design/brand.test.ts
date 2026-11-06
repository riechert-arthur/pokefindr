// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "../..")
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8")
const mark = read("public/brand/mark.svg")

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? ""

/**
 * The mark's shape, as strings to compare across copies: every path `d`,
 * every rect's position, size, corner radius and opacity, the card's tilt
 * transform and the gradient direction.
 */
const geometry = (svg: string) => [
  ...[...svg.matchAll(/<path\b[^>]*>/g)].map((m) => `path ${attr(m[0], "d")}`),
  ...[...svg.matchAll(/<rect\b[^>]*>/g)].map((m) =>
    `rect ${["x", "y", "width", "height", "rx", "opacity"].map((a) => attr(m[0], a)).join(",")}`,
  ),
  ...[...svg.matchAll(/<g\b[^>]*transform="(rotate[^"]*)"/g)].map((m) => `rotate ${m[1]}`),
  ...[...svg.matchAll(/<stop\b[^>]*>/g)].map((m) => `stop ${attr(m[0], "offset")}`),
  ...[...svg.matchAll(/<linearGradient\b[^>]*>/g)].map((m) =>
    `gradient ${["x1", "y1", "x2", "y2"].map((a) => attr(m[0], a)).join(",")}`,
  ),
]

// The mark lives in several files because each consumer needs a different
// form (themed React, static SVG, favicon). These checks keep them in sync.
describe("brand mark copies", () => {
  it("has some geometry to compare", () => {
    const shapes = geometry(mark)
    expect(shapes.filter((g) => g.startsWith("rect"))).toHaveLength(4)
    expect(shapes.some((g) => g.startsWith("rotate"))).toBe(true)
    expect(shapes.some((g) => g.startsWith("gradient"))).toBe(true)
  })

  it("uses the same SVG for the favicon as public/brand/mark.svg", () => {
    expect(read("src/app/icon.svg")).toBe(mark)
  })

  it.each(["src/components/brand/Logo.tsx", "public/brand/wordmark.svg"])("draws the same mark in %s", (file) => {
    const other = geometry(read(file))
    // Same number of each element (the wordmark adds two text paths).
    const count = (svg: string, tag: string) => (svg.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length
    const text = file.endsWith("wordmark.svg") ? 2 : 0
    for (const tag of ["rect", "stop", "linearGradient", "circle", "ellipse", "polygon"]) {
      expect(count(read(file), tag), tag).toBe(count(mark, tag))
    }
    expect(count(read(file), "path"), "path").toBe(count(mark, "path") + text)
    // The wordmark also has outlined text paths, so check containment.
    for (const shape of geometry(mark)) expect(other, shape).toContain(shape)
  })

  it("builds generated images from public/brand/mark.svg", () => {
    expect(read("src/app/brand-mark.ts")).toContain('"public/brand/mark.svg"')
  })
})
