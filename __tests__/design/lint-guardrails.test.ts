// @vitest-environment node
import path from "node:path"
import { ESLint } from "eslint"
import { beforeAll, describe, it, expect } from "vitest"

const ROOT = path.resolve(__dirname, "../..")
const eslint = new ESLint({ cwd: ROOT })

// Loading the Next ESLint config (parsers and plugins) is slow on a cold runner,
// so do it once up front with a generous timeout instead of in the first test.
beforeAll(async () => {
  await eslint.lintText("export {}", { filePath: path.join(ROOT, "src/components/Warmup.tsx") })
}, 60_000)

/** Lints `code` as if it lived at `file`, returning only the design-system violations. */
async function colorErrors(code: string, file = "src/components/Example.tsx") {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) })
  // A parse error or an ignored file has a null ruleId; fail instead of reading it as "no violations".
  expect(result.fatalErrorCount, `${file} parses`).toBe(0)
  expect(result.messages.filter((m) => m.ruleId === null).map((m) => m.message), `${file} is linted`).toEqual([])
  return result.messages.filter((m) => m.ruleId === "no-restricted-syntax").map((m) => m.message)
}

describe("design-system lint guardrails", () => {
  it.each([
    ["an arbitrary hex color class", `export const A = () => <div className="bg-[#ff0000]" />`],
    ["an arbitrary rgb color class", "export const A = () => <div className={`p-2 text-[rgb(0,0,0)]`} />"],
    ["a Tailwind palette color", `export const A = () => <p className="mt-2 text-blue-600" />`],
    ["a palette color with a variant", `export const A = () => <a className="hover:bg-indigo-500" />`],
    ["a hex color in a style", `export const A = () => <div style={{ color: "#fff" }} />`],
    ["an rgba() color in a style", `export const A = () => <div style={{ background: "rgba(0,0,0,.5)" }} />`],
    ["a 4-digit hex color", `export const A = () => <div style={{ color: "#fff8" }} />`],
    ["a hex fill attribute", `export const A = () => <path fill="#eb5569" />`],
    ["a hex color in template CSS", "export const css = `.x { color: #abc; }`"],
    ["an important palette class", `export const A = () => <p className="!text-blue-500" />`],
    ["a directional border color", `export const A = () => <p className="border-t-red-500" />`],
    ["an arbitrary oklch color", `export const A = () => <p className="bg-[oklch(0.6_0.2_250)]" />`],
    ["an arbitrary named color", `export const A = () => <p className="text-[color:red]" />`],
    ["a color function inside an arbitrary value", `export const A = () => <p className="shadow-[0_0_10px_rgba(0,0,0,.5)]" />`],
    ["a hex color inside an arbitrary value", `export const A = () => <p className="shadow-[0_0_10px_#fff]" />`],
    ["a hex color in a gradient", `export const A = () => <div style={{ backgroundImage: "linear-gradient(135deg, #c026d3, #7c3aed)" }} />`],
    ["a hex color in a var() fallback", `export const A = () => <p className="bg-[var(--x,#fff)]" />`],
    ["a theme() palette lookup", `export const A = () => <p className="text-[theme(colors.blue.500)]" />`],
    ["a hex color in a border shorthand", `export const A = () => <div style={{ border: "1px solid #ddd" }} />`],
    ["a hex color constant", `export const brandColor = "#c026d3"`],
    ["a hex color in a color map", `export const KIND_COLORS = { shop: "#c026d3" }`],
    ["a hex constant with any name", `export const PIN = "#c026d3"`],
    ["a hex color in a ternary", `export const A = ({ on }: { on: boolean }) => <p style={{ color: on ? "#fff" : "#000" }} />`],
    ["a hex color in a template literal", "export const A = () => <p style={{ color: `#fff` }} />"],
    ["a named color in a style", `export const A = () => <p style={{ color: "red", background: "white" }} />`],
    ["an arbitrary color property", `export const A = () => <p className="[color:red]" />`],
    ["an upper-case color function", `export const A = () => <p style={{ color: "RGB(0,0,0)" }} />`],
    ["upper-case CSS in a template", "export const css = `.x { Color: #abc }`"],
    ["a raw color in src/lib", `export const style = { paint: "rgb(0, 0, 0)" }`, "src/lib/map/style.ts"],
    ["a raw color in a .js file", `export const c = "rgb(0, 0, 0)"`, "src/components/legacy.js"],
  ])("rejects %s", async (_label, code, file?: string) => {
    expect(await colorErrors(code, file)).not.toEqual([])
  })

  it.each([
    ["token classes", `export const A = () => <div className="bg-primary text-kind-shop border-border" />`],
    ["token alpha", `export const A = () => <div className="bg-primary/90 ring-primary/10" />`],
    ["hsl(var(--token)) in a style", `export const A = () => <div style={{ color: "hsl(var(--brand))" }} />`],
    ["arbitrary non-color values", `export const A = () => <div className="z-[1000] w-[36rem] left-[calc(50%-11rem)]" />`],
    ["white and black for overlays", `export const A = () => <div className="bg-black/80 text-white" />`],
    ["an in-page anchor", `export const A = () => <a href="#faq">FAQ</a>`],
    ["an anchor made of hex letters", `export const A = () => <a href="#add">Add</a>`],
    ["an issue reference in text", `export const A = () => <p title="Fixed in #142">See #100</p>`],
    ["an issue reference after a colon", `export const A = () => <p title="Fixes: #142">Bug: #abc</p>`],
    ["anchors outside a plain href", "export const nav = [{ name: 'Add', href: '#add' }]; export const A = () => <a href={\"#add\"} onClick={() => document.querySelector(\"#face\")} />"],
    ["an SVG fragment reference", `export const A = () => <p className="bg-[url(#a)]" />`],
    ["issue references in parentheses and lists", `export const A = () => <p title="Fixed map crash (#142)">See #12, #142 (#abc)</p>`],
    ["a token color inside an arbitrary value", `export const A = () => <div className="bg-[hsl(var(--brand)/0.3)]" />`],
  ])("allows %s", async (_label, code) => {
    expect(await colorErrors(code)).toEqual([])
  })

  it("exempts illustration icons and generated images", async () => {
    const svg = `export const I = () => <path fill="#eb5569" />`
    expect(await colorErrors(svg, "src/components/icons/Example.tsx")).toEqual([])
    expect(await colorErrors(`export const color = "#ffffff"`, "src/app/opengraph-image.tsx")).toEqual([])
    expect(await colorErrors(`export const color = "#ffffff"`, "src/app/(visitor)/(content)/blog/[slug]/opengraph-image.tsx")).toEqual([])
  })
})

describe("map library imports", () => {
  /** The no-restricted-imports messages for `code` linted as if it lived at `file`. */
  async function importErrors(code: string, file: string) {
    const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) })
    expect(result.fatalErrorCount, `${file} parses`).toBe(0)
    return result.messages.filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message)
  }

  it.each([
    [`import maplibregl from "maplibre-gl"`],
    [`import "maplibre-gl/dist/maplibre-gl.css"`],
    [`import { Map } from "@vis.gl/react-maplibre"`],
    [`import Map from "react-map-gl"`],
    [`import { Map } from "react-map-gl/maplibre"`],
    [`import mapboxgl from "mapbox-gl"`],
  ])("rejects %s outside engine.ts", async (code) => {
    const errors = await importErrors(code, "src/components/map/Example.tsx")
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("@/components/map/engine")
  })

  it("allows engine.ts, and imports through it", async () => {
    expect(await importErrors(`import { Map } from "@vis.gl/react-maplibre"`, "src/components/map/engine.ts")).toEqual([])
    expect(await importErrors(`import { Map } from "./engine"`, "src/components/map/Example.tsx")).toEqual([])
  })
})
