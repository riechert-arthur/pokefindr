// @vitest-environment node
import path from "node:path"
import { ESLint } from "eslint"
import { describe, it, expect } from "vitest"

const ROOT = path.resolve(__dirname, "../..")
const eslint = new ESLint({ cwd: ROOT })

/** Lints `code` as if it lived at `file`, returning only the design-system violations. */
async function colorErrors(code: string, file = "src/components/Example.tsx") {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) })
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
  ])("rejects %s", async (_label, code) => {
    expect(await colorErrors(code)).not.toEqual([])
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
    ["a token color inside an arbitrary value", `export const A = () => <div className="bg-[hsl(var(--brand)/0.3)]" />`],
  ])("allows %s", async (_label, code) => {
    expect(await colorErrors(code)).toEqual([])
  })

  it("exempts illustration icons and generated images", async () => {
    const svg = `export const I = () => <path fill="#eb5569" />`
    expect(await colorErrors(svg, "src/components/icons/Example.tsx")).toEqual([])
    expect(await colorErrors(`export const c = "#ffffff"`, "src/app/opengraph-image.tsx")).toEqual([])
  })
})
