// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"
import { COLOR_TOKENS, HSL_CHANNELS, channelsToHsl, kindToken } from "@/lib/design/tokens"

const ROOT = path.resolve(__dirname, "../..")
const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8")
const tailwind = readFileSync(path.join(ROOT, "tailwind.config.ts"), "utf8")

/**
 * The custom properties declared in the CSS rule whose selector list includes
 * `selector`. Throws if no rule matches, so a reformat fails loudly here
 * instead of as dozens of missing-token failures.
 */
function block(selector: string): Map<string, string> {
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = rule[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((s) => s.trim())
    if (!selectors.includes(selector)) continue
    const decls = new Map<string, string>()
    for (const m of rule[2].matchAll(/--([\w-]+):\s*([^;]+);/g)) decls.set(m[1], m[2].trim())
    return decls
  }
  throw new Error(`No "${selector}" rule in globals.css`)
}

const light = block(":root")
const dark = block(".dark")

describe("design tokens", () => {
  it.each(COLOR_TOKENS)("defines %s in light and dark as HSL channels", (token) => {
    for (const mode of [light, dark]) {
      expect(mode.get(token), token).toMatch(HSL_CHANNELS)
    }
  })

  it("only references tokens from tailwind.config.ts that are defined in light and dark", () => {
    const used = [...tailwind.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]).filter((t) => t !== "radius")
    expect(used.length).toBeGreaterThan(0)
    for (const token of used) {
      expect(light.has(token), `${token} in :root`).toBe(true)
      expect(dark.has(token), `${token} in .dark`).toBe(true)
    }
  })

  it("converts channels to a comma-separated hsl() color", () => {
    expect(channelsToHsl(" 221.2 83.2% 53.3% ")).toBe("hsl(221.2, 83.2%, 53.3%)")
    expect(channelsToHsl("")).toBeUndefined()
    expect(channelsToHsl("221.2 83.2 53.3")).toBeUndefined()
    expect(channelsToHsl("red blue green")).toBeUndefined()
    expect(channelsToHsl("-10 50% 50%")).toBeUndefined()
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

  /** Blanks out comments but keeps line numbers. */
  const stripComments = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")

  // Flags, outside comments:
  // - hex colors (#rgb, #rgba, #rrggbb, #rrggbbaa) not followed by more of an
  //   id, and not an href/url(#...) fragment, so "#add-review" and "#cafe" pass
  // - color functions, unless they wrap a token as in hsl(var(--primary))
  // - CSS named colors as a whole quoted string ("red") or after a CSS colon
  // - Tailwind arbitrary colors such as bg-[color:red] or text-[#fff]
  const NAMED =
    "aqua|beige|black|blue|brown|crimson|cyan|fuchsia|gold|gray|green|grey|indigo|ivory|lime|magenta|maroon|navy|olive|orange|pink|purple|red|salmon|silver|teal|tomato|turquoise|violet|white|yellow"
  const RAW_COLOR = new RegExp(
    [
      String.raw`(?<![\w&])(?<!href=["'{\`]?\s*)(?<!url\(\s*["']?)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])`,
      String.raw`\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\((?!\s*var\()`,
      String.raw`(["'\`])(?:${NAMED})\1`,
      String.raw`(?:color|fill|stroke|background(?:-color)?)\s*:\s*(?:${NAMED})\b`,
      String.raw`-\[(?:color:)?(?!var\()(?:#|${NAMED}\b|(?:rgb|hsl)a?\()`,
    ].join("|"),
    "i",
  )

  it("uses tokens instead of raw colors outside src/components/icons", () => {
    const offenders = files
      .filter((f) => !EXEMPT.some((e) => path.relative(ROOT, f).startsWith(e)))
      .flatMap((f) =>
        stripComments(readFileSync(f, "utf8"))
          .split("\n")
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => RAW_COLOR.test(line))
          .map(({ i }) => `${path.relative(ROOT, f)}:${i + 1}`),
      )
    expect(offenders).toEqual([])
  })

  it("catches raw colors and ignores ids and token wrappers", () => {
    expect(RAW_COLOR.test(`style={{ color: "rgb(255, 0, 0)" }}`)).toBe(true)
    expect(RAW_COLOR.test(`fill="#f28cb1"`)).toBe(true)
    expect(RAW_COLOR.test(`style={{ color: "white" }}`)).toBe(true)
    expect(RAW_COLOR.test(`"text-color": 'red'`)).toBe(true)
    expect(RAW_COLOR.test(`color: red;`)).toBe(true)
    expect(RAW_COLOR.test(`className="bg-[color:red]"`)).toBe(true)
    expect(RAW_COLOR.test(`className="text-[#fff]"`)).toBe(true)
    expect(RAW_COLOR.test(`href="#add-review"`)).toBe(false)
    expect(RAW_COLOR.test(`href="#cafe"`)).toBe(false)
    expect(RAW_COLOR.test(`fill="url(#bead)"`)).toBe(false)
    expect(RAW_COLOR.test(`color: hsl(var(--primary))`)).toBe(false)
    expect(RAW_COLOR.test(`className="bg-[var(--brand)]"`)).toBe(false)
    expect(RAW_COLOR.test(`label="Red team"`)).toBe(false)
  })
})
