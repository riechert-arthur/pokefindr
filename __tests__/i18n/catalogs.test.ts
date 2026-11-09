// @vitest-environment node
/**
 * Keeps the catalogs complete and in step (#178, docs/i18n.md): every
 * language has exactly English's messages, each parses as ICU with the same
 * placeholders and tags, and every English message is used somewhere in src/.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { ESLint } from "eslint"
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser"
import { beforeAll, describe, expect, it } from "vitest"
import { catalogLocales, readCatalog } from "../../scripts/i18n/build.mjs"

const ROOT = path.resolve(__dirname, "../..")
type Tree = { [key: string]: string | Tree }

/** Every message as [key, text], keys dotted. */
const flatten = (tree: Tree, prefix = ""): [string, string][] =>
  Object.entries(tree).flatMap(([k, v]) => (typeof v === "string" ? [[prefix + k, v] as [string, string]] : flatten(v, `${prefix}${k}.`)))

/** A message's placeholders and rich-text tags, e.g. ["arg:count", "tag:link"]. */
function slots(elements: MessageFormatElement[], out = new Set<string>()): Set<string> {
  for (const el of elements) {
    if (el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date || el.type === TYPE.time) out.add(`arg:${el.value}`)
    if (el.type === TYPE.plural || el.type === TYPE.select) {
      out.add(`arg:${el.value}`)
      for (const option of Object.values(el.options)) slots(option.value, out)
    }
    if (el.type === TYPE.tag) {
      out.add(`tag:${el.value}`)
      slots(el.children, out)
    }
  }
  return out
}

const en = new Map(flatten(readCatalog("en")))
const others = catalogLocales().filter((l: string) => l !== "en")

describe("message catalogs", () => {
  it("has at least one other language", () => {
    expect(others.length).toBeGreaterThan(0)
  })

  it.each(others)("%s has exactly English's keys", (locale) => {
    const keys = new Set(flatten(readCatalog(locale)).map(([k]) => k))
    expect([...en.keys()].filter((k) => !keys.has(k)), `missing from messages/${locale}.yml`).toEqual([])
    expect([...keys].filter((k) => !en.has(k)), `in messages/${locale}.yml but not in English`).toEqual([])
  })

  it.each(["en", ...others])("%s: every message is ICU with English's placeholders and tags", (locale) => {
    const problems: string[] = []
    for (const [key, text] of flatten(readCatalog(locale))) {
      try {
        const mine = [...slots(parse(text))].sort()
        const english = [...slots(parse(en.get(key) ?? ""))].sort()
        if (mine.join() !== english.join()) problems.push(`${key}: ${mine.join(", ") || "none"}, English has ${english.join(", ") || "none"}`)
      } catch (err) {
        problems.push(`${key}: doesn't parse (${(err as Error).message})`)
      }
    }
    expect(problems).toEqual([])
  })
})

/** Every file under src/, as text. */
function sources(dir = path.join(ROOT, "src")): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    if (statSync(file).isDirectory()) return name === "generated" ? [] : sources(file)
    return /\.(ts|tsx)$/.test(name) ? [readFileSync(file, "utf8")] : []
  })
}

/**
 * What one file can read: the namespaces it names (useTranslations("map"),
 * getTranslations({ namespace }), a useTranslations<"faq"> type, or the root
 * for useTranslations()), and its strings. A template's ${…} matches one key
 * segment, and only in key-like templates with a word of their own
 * (`kinds.${kind}.name`, not `${a}.${b}`).
 */
function readsOf(code: string) {
  const namespaces = new Set<string>()
  for (const m of code.matchAll(/(?:useTranslations|getTranslations)(?:<\s*["'`]([\w.-]+)["'`]\s*>|\(\s*["'`]([\w.-]+)["'`])/g)) namespaces.add((m[1] ?? m[2])!)
  for (const m of code.matchAll(/namespace:\s*["'`]([\w.-]+)["'`]/g)) namespaces.add(m[1])
  if (/(?:useTranslations|getTranslations)\(\s*\)|getTranslations\(\{\s*locale[^}]*\}\)/.test(code)) namespaces.add("")
  const exact = new Set<string>()
  const patterns: RegExp[] = []
  for (const m of code.matchAll(/"([\w.-]+)"|'([\w.-]+)'|`([^`]*)`/g)) {
    if (m[1] ?? m[2]) exact.add((m[1] ?? m[2])!)
    else if (m[3]?.includes("${")) {
      const parts = m[3].split(/\$\{[^}]*\}/)
      if (!parts.every((p) => /^[\w.-]*$/.test(p)) || !parts.some((p) => /[A-Za-z]{2,}/.test(p))) continue
      patterns.push(new RegExp(`^${parts.map((p) => p.replace(/\./g, "\\.")).join("[\\w-]+")}$`))
    } else if (m[3]) exact.add(m[3])
  }
  // t(failure), t(kind): a key from a variable holding one of a set of strings.
  const byVariable = /\bt\(\s*[A-Za-z_]\w*(?:\s+as\s+\w+)?\s*[,)]/.test(code)
  // Object keys (`AK: { name: "Alaska" }`): where such a variable's values often come from.
  const keys = new Set([...code.matchAll(/^\s*(\w+):\s/gm)].map((m) => m[1]))
  return { namespaces, exact, patterns, byVariable, keys }
}

describe("unused messages", () => {
  it("every English message is read somewhere in src/", () => {
    const files = sources().map(readsOf)
    const anywhere = new Set(files.flatMap((f) => [...f.exact, ...f.keys]))
    const used = (key: string) =>
      files.some(({ namespaces, exact, patterns, byVariable }) =>
        [...namespaces].some((ns) => {
          if (ns && !key.startsWith(`${ns}.`)) return false
          const rest = ns ? key.slice(ns.length + 1) : key
          if (exact.has(rest) || patterns.some((p) => p.test(rest))) return true
          // A last segment read through a variable that holds it ("webgl", "shop", a state's code).
          return byVariable && !rest.includes(".") && anywhere.has(rest)
        }),
      )
    expect([...en.keys()].filter((k) => !used(k))).toEqual([])
  })
})

describe("the lint rule against hard-coded copy", () => {
  const eslint = new ESLint({ cwd: ROOT })
  beforeAll(async () => {
    await eslint.lintText("export {}", { filePath: path.join(ROOT, "src/components/Warmup.tsx") })
  }, 60_000)
  const copyErrors = async (code: string, file = "src/components/Example.tsx") => {
    const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) })
    expect(result.fatalErrorCount).toBe(0)
    return result.messages.filter((m) => m.ruleId === "no-restricted-syntax" && m.message.includes("messages/en.yml")).length
  }

  it("flags words in JSX, read attributes and toasts", async () => {
    expect(await copyErrors(`export const A = () => <p>Hello</p>`)).toBe(1)
    expect(await copyErrors(`export const A = () => <input placeholder="Search here" aria-label="Search" />`)).toBe(2)
    expect(await copyErrors(`export const A = () => <p>{"Hello"}</p>`)).toBe(1)
    expect(await copyErrors(`import { toast } from "sonner"\nexport const f = () => toast.error("It broke")`)).toBe(1)
    expect(await copyErrors(`export const A = () => <p>Hello</p>`, "src/app/[locale]/(visitor)/thing/page.tsx")).toBe(1)
  })

  it("leaves catalog reads, symbols and English-only pages alone", async () => {
    expect(await copyErrors(`export const A = ({ t }: { t: (k: string) => string }) => <p title={t("x")}>{t("y")} · 404 &rarr;</p>`)).toBe(0)
    expect(await copyErrors(`export const A = () => <input placeholder="https://" />`)).toBe(0)
    expect(await copyErrors(`export const A = () => <p>Hello</p>`, "src/components/admin/Example.tsx")).toBe(0)
    expect(await copyErrors(`export const A = () => <p>Hello</p>`, "src/app/[locale]/(visitor)/privacy-policy/page.tsx")).toBe(0)
  })
})
