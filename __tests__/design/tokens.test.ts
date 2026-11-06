// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"
import { COLOR_TOKENS, channelsToHsl, kindToken } from "@/lib/design/tokens"

const ROOT = path.resolve(__dirname, "../..")
const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8")
const tailwind = readFileSync(path.join(ROOT, "tailwind.config.ts"), "utf8")

/** The declarations inside the first `selector { … }` block after `@layer base`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  const end = css.indexOf("}", start)
  const decls = new Map<string, string>()
  for (const m of css.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) decls.set(m[1], m[2].trim())
  return decls
}

const light = block(":root")
const dark = block(".dark")

describe("design tokens", () => {
  it.each(COLOR_TOKENS)("defines %s in light and dark as HSL channels", (token) => {
    for (const mode of [light, dark]) {
      expect(mode.get(token), token).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/)
    }
  })

  it("only references defined tokens from tailwind.config.ts", () => {
    const used = [...tailwind.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]).filter((t) => t !== "radius")
    expect(used.length).toBeGreaterThan(0)
    for (const token of used) expect(light.has(token), token).toBe(true)
  })

  it("converts channels to a comma-separated hsl() color", () => {
    expect(channelsToHsl(" 221.2 83.2% 53.3% ")).toBe("hsl(221.2, 83.2%, 53.3%)")
    expect(channelsToHsl("")).toBeUndefined()
    expect(kindToken("shop")).toBe("kind-shop")
  })
})

describe("no raw colors in components", () => {
  // Illustrations (multi-color SVG artwork) are the one exception.
  const EXEMPT = [path.join("src", "components", "icons") + path.sep]
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(tsx?|css)$/.test(name)) files.push(full)
    }
  }
  walk(path.join(ROOT, "src/components"))

  it("uses tokens instead of hex colors outside src/components/icons", () => {
    const offenders = files
      .filter((f) => !EXEMPT.some((e) => path.relative(ROOT, f).startsWith(e)))
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => /#[0-9a-fA-F]{3,8}\b/.test(line) && !/^\s*(\/\/|\*)/.test(line))
          .map(({ i }) => `${path.relative(ROOT, f)}:${i + 1}`),
      )
    expect(offenders).toEqual([])
  })
})
