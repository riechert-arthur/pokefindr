// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"
import tailwindConfig from "../../tailwind.config"
import { COLOR_TOKENS, HSL_CHANNELS, channelsToHsl } from "@/lib/design/tokens"

const ROOT = path.resolve(__dirname, "../..")
const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8")
const tailwind = readFileSync(path.join(ROOT, "tailwind.config.ts"), "utf8")
const layout = readFileSync(path.join(ROOT, "src/app/[locale]/layout.tsx"), "utf8")
const fontSize = (tailwindConfig.theme?.extend?.fontSize ?? {}) as Record<string, [string, unknown]>

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

  // --radius is defined once (not per theme); the fonts come from next/font;
  // --radix-* variables are set by Radix at runtime (e.g. accordion height).
  const NOT_THEMED = ["radius", "font-sans", "font-mono"]
  const isThemed = (t: string) => !NOT_THEMED.includes(t) && !t.startsWith("radix-")

  it("only references tokens from tailwind.config.ts that are defined in light and dark", () => {
    const used = [...tailwind.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]).filter(isThemed)
    expect(used.length).toBeGreaterThan(0)
    for (const font of ["font-sans", "font-mono"]) {
      expect(layout, `layout.tsx sets --${font}`).toContain(`variable: "--${font}"`)
    }
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
  })

  // primary-foreground is the text on primary buttons, on avatar initials
  // (brand, UserMenu.tsx) and on the logo gradient (brand to brand-2).
  it.each(["primary", "brand-2", "brand"])("keeps primary-foreground at 4.5:1 or more on %s", (fill) => {
    for (const [name, mode] of [["light", light], ["dark", dark]] as const) {
      const ratio = contrast(mode.get("primary-foreground")!, mode.get(fill)!)
      expect(ratio, `${name} ${fill}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

/** WCAG contrast ratio between two token values ("221.2 83.2% 53.3%"). */
function contrast(a: string, b: string): number {
  const luminance = (channels: string) => {
    const [h, s, l] = channels.trim().split(/\s+/).map(parseFloat)
    const sat = s / 100
    const light = l / 100
    const k = (n: number) => (n + h / 30) % 12
    const amp = sat * Math.min(light, 1 - light)
    const [r, g, bl] = [0, 8, 4].map((n) => {
      const v = light - amp * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe("no raw colors outside globals.css", () => {
  // globals.css defines the tokens. Illustrations (multi-color SVG artwork)
  // and generated images, which can't read CSS variables, are the other
  // exceptions.
  const EXEMPT = [path.join("src", "app", "globals.css"), path.join("src", "components", "icons") + path.sep]
  // Generated image routes anywhere under src/app, as in .eslintrc.js (any extension Next accepts).
  const IMAGE_ROUTE = /^src\/app\/(.+\/)?((opengraph-image|twitter-image|icon|apple-icon)|social-card\/route)\.(tsx|ts|jsx|js)$/
  const isExempt = (file: string) => {
    const rel = path.relative(ROOT, file)
    return EXEMPT.some((e) => rel.startsWith(e)) || IMAGE_ROUTE.test(rel.split(path.sep).join("/"))
  }
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(tsx?|css)$/.test(name)) files.push(full)
    }
  }
  walk(path.join(ROOT, "src/components"))
  walk(path.join(ROOT, "src/app"))

  /**
   * Blanks out comments but keeps line numbers. Skips over string and
   * template literals, so "src/**" or "http://..." inside a string isn't
   * taken for a comment. (Regex literals aren't recognized.)
   */
  const stripComments = (src: string) => {
    let out = ""
    let i = 0
    const blank = (text: string) => text.replace(/[^\n]/g, " ")
    while (i < src.length) {
      const ch = src[i]
      if (ch === '"' || ch === "'" || ch === "`") {
        let j = i + 1
        while (j < src.length && src[j] !== ch && (ch === "`" || src[j] !== "\n")) j += src[j] === "\\" ? 2 : 1
        out += src.slice(i, j + 1)
        i = j + 1
      } else if (src.startsWith("/*", i)) {
        const end = src.indexOf("*/", i + 2)
        const j = end === -1 ? src.length : end + 2
        out += blank(src.slice(i, j))
        i = j
      } else if (src.startsWith("//", i) && src[i - 1] !== ":") {
        // The ":" check keeps unquoted CSS urls such as url(http://...).
        const end = src.indexOf("\n", i)
        const j = end === -1 ? src.length : end
        out += blank(src.slice(i, j))
        i = j
      } else {
        out += ch
        i++
      }
    }
    return out
  }

  // Flags, outside comments:
  // - a hex color (#rgb, #rgba, #rrggbb, #rrggbbaa) that is a whole quoted
  //   string ("#fff", not as an href) or comes after a CSS colon (color: #fff),
  //   so text like "Machine #123" passes
  // - color functions, unless they wrap a token as in hsl(var(--primary))
  // - CSS named colors as a whole quoted string ("red") or after a CSS colon
  // - Tailwind arbitrary colors such as bg-[color:red] or text-[#fff]
  const HEX = "#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})"
  const NAMED =
    "aqua|beige|black|blue|brown|crimson|cyan|fuchsia|gold|gray|green|grey|indigo|ivory|lime|magenta|maroon|navy|olive|orange|pink|purple|red|salmon|silver|teal|tomato|turquoise|violet|white|yellow"
  const RAW_COLOR = new RegExp(
    [
      String.raw`(?<!href=\{?\s*)(["'\`])${HEX}\1`,
      String.raw`:\s*${HEX}(?![\w-])`,
      String.raw`\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\((?!\s*var\()`,
      String.raw`(["'\`])(?:${NAMED})\2`,
      String.raw`(?:color|fill|stroke|background(?:-color)?)\s*:\s*(?:${NAMED})\b`,
      String.raw`-\[(?:color:)?(?!var\()(?:#|${NAMED}\b|(?:rgb|hsl)a?\()`,
    ].join("|"),
    "i",
  )

  it("uses tokens instead of raw colors", () => {
    const offenders = files
      .filter((f) => !isExempt(f))
      .flatMap((f) =>
        stripComments(readFileSync(f, "utf8"))
          .split("\n")
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => RAW_COLOR.test(line))
          .map(({ i }) => `${path.relative(ROOT, f)}:${i + 1}`),
      )
    expect(offenders).toEqual([])
  })

  it("catches raw colors and ignores ids, text and token wrappers", () => {
    expect(RAW_COLOR.test(`style={{ color: "rgb(255, 0, 0)" }}`)).toBe(true)
    expect(RAW_COLOR.test(`fill="#f28cb1"`)).toBe(true)
    expect(RAW_COLOR.test(`style={{ color: "#fff" }}`)).toBe(true)
    expect(RAW_COLOR.test(`color: #fff;`)).toBe(true)
    expect(RAW_COLOR.test(`--ring: #3b82f6;`)).toBe(true)
    expect(RAW_COLOR.test(`style={{ color: "white" }}`)).toBe(true)
    expect(RAW_COLOR.test(`"text-color": 'red'`)).toBe(true)
    expect(RAW_COLOR.test(`color: red;`)).toBe(true)
    expect(RAW_COLOR.test(`className="bg-[color:red]"`)).toBe(true)
    expect(RAW_COLOR.test(`className="text-[#fff]"`)).toBe(true)
    expect(RAW_COLOR.test(`href="#add-review"`)).toBe(false)
    expect(RAW_COLOR.test(`href="#cafe"`)).toBe(false)
    expect(RAW_COLOR.test(`href={"#cafe"}`)).toBe(false)
    expect(RAW_COLOR.test(`fill="url(#bead)"`)).toBe(false)
    expect(RAW_COLOR.test(`<span>Machine #123</span>`)).toBe(false)
    expect(RAW_COLOR.test(`title="Pokemon #025"`)).toBe(false)
    expect(RAW_COLOR.test(`color: hsl(var(--primary))`)).toBe(false)
    expect(RAW_COLOR.test(`className="bg-[var(--brand)]"`)).toBe(false)
    expect(RAW_COLOR.test(`label="Red team"`)).toBe(false)
  })

  it("exempts the same generated image routes as the lint rule", async () => {
    // Ask ESLint which files get the color rules, so the two lists can't drift.
    const { ESLint } = await import("eslint")
    const eslint = new ESLint({ cwd: ROOT })
    const lintChecksColors = async (rel: string) => {
      const config = await eslint.calculateConfigForFile(path.join(ROOT, rel))
      const options = (config.rules?.["no-restricted-syntax"] ?? []) as unknown[]
      return options.some((o) => typeof o === "object" && o !== null && /Literal\[value=\/.*#/.test((o as { selector?: string }).selector ?? ""))
    }
    const samples = [
      ...["opengraph-image", "twitter-image", "icon", "apple-icon"].flatMap((route) =>
        ["tsx", "js"].flatMap((ext) => [`src/app/${route}.${ext}`, `src/app/(visitor)/blog/[slug]/${route}.${ext}`]),
      ),
      "src/app/[locale]/social-card/route.tsx",
      "src/app/brand-mark.ts",
      "src/app/icons.tsx",
      "src/app/page.tsx",
    ]
    for (const rel of samples) {
      expect(isExempt(path.join(ROOT, rel)), rel).toBe(!(await lintChecksColors(rel)))
    }
  }, 30_000)

  it("strips comments but not comment markers inside strings", () => {
    const src = `const glob = "src/**/*.tsx"\n<path fill="#f00" />\n/* "#fff" */ // "#000"\nurl(http://x)`
    const lines = stripComments(src).split("\n")
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe(`const glob = "src/**/*.tsx"`)
    expect(RAW_COLOR.test(lines[1])).toBe(true)
    expect(lines[2].trim()).toBe("")
    expect(lines[3]).toBe("url(http://x)")
  })
})

describe("type scale", () => {
  it.each(["display", "title", "heading", "subheading", "body-lg", "body", "caption", "overline"])("defines text-%s", (size) => {
    expect(fontSize).toHaveProperty([size])
  })

  it("scales display and title with the browser's font size", () => {
    // A rem term inside clamp() keeps text-size and zoom settings working.
    for (const size of ["display", "title"]) expect(fontSize[size][0]).toMatch(/^clamp\([^,]+,[^,]*rem[^,]*,[^,]+\)$/)
  })
})
