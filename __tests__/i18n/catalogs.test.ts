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
 * getTranslations({ namespace }), a useTranslations<"faq"> type, a
 * Messages["auth"]["validation"] type, or the root for useTranslations()),
 * and its strings. A template's ${…} matches one key
 * segment, and only in key-like templates with a word of their own
 * (`kinds.${kind}.name`, not `${a}.${b}`).
 */
/** Helpers that hand back a translator for one namespace (src/i18n/seo.ts). */
const TRANSLATOR_HELPERS: Record<string, string> = { ogTranslator: "og" }

function readsOf(code: string) {
  const namespaces = new Set<string>()
  for (const m of code.matchAll(/(?:useTranslations|getTranslations)(?:<\s*["'`]([\w.-]+)["'`]\s*>|\(\s*["'`]([\w.-]+)["'`])/g)) namespaces.add((m[1] ?? m[2])!)
  for (const m of code.matchAll(/namespace:\s*["'`]([\w.-]+)["'`]/g)) namespaces.add(m[1])
  for (const [helper, namespace] of Object.entries(TRANSLATOR_HELPERS)) if (code.includes(`${helper}(`)) namespaces.add(namespace)
  for (const m of code.matchAll(/\bMessages((?:\[\s*"\w+"\s*\])+)/g)) namespaces.add([...m[1].matchAll(/"(\w+)"/g)].map((k) => k[1]).join("."))
  // The root: useTranslations(), or getTranslations({ locale }) with no namespace.
  if (/(?:useTranslations|getTranslations)\(\s*\)|getTranslations\(\{\s*locale(?:\s*:\s*[\w.]+(?:\s+as\s+\w+)?)?\s*\}\)/.test(code)) namespaces.add("")
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
  const byVariable = /\bt\(\s*[A-Za-z_]\w*\s*[,)]/.test(code)
  // The sets such a variable can come from: a union type ("webgl" | "crash")
  // or an array of strings (["vending", "shop"]), in any file.
  const members = new Set<string>()
  for (const m of code.matchAll(/(?:\|\s*)(["'])([\w-]+)\1|(["'])([\w-]+)\3(?=\s*\|)/g)) members.add((m[2] ?? m[4])!)
  for (const list of code.matchAll(/\[\s*(?:["'][\w-]+["']\s*,\s*)+["'][\w-]+["']\s*,?\s*\]/g)) for (const m of list[0].matchAll(/["']([\w-]+)["']/g)) members.add(m[1])
  return { namespaces, exact, patterns, byVariable, members }
}

describe("unused messages", () => {
  it("every English message is read somewhere in src/", () => {
    const files = sources().map(readsOf)
    const sets = new Set(files.flatMap((f) => [...f.members]))
    const used = (key: string) =>
      files.some(({ namespaces, exact, patterns, byVariable }) =>
        [...namespaces].some((ns) => {
          if (ns && !key.startsWith(`${ns}.`)) return false
          const rest = ns ? key.slice(ns.length + 1) : key
          if (exact.has(rest) || patterns.some((p) => p.test(rest))) return true
          // A last segment read through a variable that holds it ("webgl", "shop").
          return byVariable && !rest.includes(".") && sets.has(rest)
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

  it("flags words either side of a ternary or &&, in templates, and in a toast's options", async () => {
    expect(await copyErrors(`export const A = ({ o }: { o: boolean }) => <p>{o ? "Open now" : "Closed"}</p>`)).toBe(2)
    expect(await copyErrors(`export const A = ({ o }: { o: boolean }) => <p>{o && "Open now"}</p>`)).toBe(1)
    expect(await copyErrors("export const A = ({ n }: { n: number }) => <p>{`${n} reviews`}</p>")).toBe(1)
    expect(await copyErrors(`export const A = ({ o }: { o: boolean }) => <button aria-label={o ? "Close menu" : "Open menu"} />`)).toBe(2)
    expect(await copyErrors("import { toast } from \"sonner\"\nexport const f = (n: number) => toast(`${n} saved`)")).toBe(1)
    expect(await copyErrors(`import { toast } from "sonner"\nexport const f = () => toast.error("x", { description: "Something went wrong" })`)).toBe(1)
    expect(await copyErrors(`import { toast } from "sonner"\nexport const f = () => toast.error("It broke")`, "src/lib/example.ts")).toBe(1)
  })

  it("leaves braced class names, links and other attributes alone", async () => {
    expect(await copyErrors(`export const A = () => <a className={"flex items-center"} href={"/about"} type={"button"}>{" · "}</a>`)).toBe(0)
  })

  it("leaves catalog reads, symbols and English-only pages alone", async () => {
    expect(await copyErrors(`export const A = ({ t }: { t: (k: string) => string }) => <p title={t("x")}>{t("y")} · 404 &rarr;</p>`)).toBe(0)
    expect(await copyErrors(`export const A = () => <input placeholder="https://" />`)).toBe(0)
    expect(await copyErrors(`export const A = () => <p>Hello</p>`, "src/components/admin/Example.tsx")).toBe(0)
    expect(await copyErrors(`export const A = () => <p>Hello</p>`, "src/app/[locale]/(visitor)/privacy-policy/page.tsx")).toBe(0)
  })
})
