/**
 * Builds the message catalogs: messages/<locale>.yml → src/i18n/generated/<locale>.json
 * (docs/i18n.md). Run with `npm run i18n:build`; it also runs on install and when
 * next.config.ts, Storybook and Vitest load, and `next dev` rebuilds on every change.
 *
 * Plain JavaScript so those configs can import it without a TypeScript loader.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, watch, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
export const MESSAGES_DIR = join(root, "messages")
export const OUT_DIR = join(root, "src/i18n/generated")

/** Throws unless every leaf is a string and every key is a plain name (no dots: they nest). */
function check(node, path, file) {
  if (typeof node === "string") return
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    throw new Error(`${file}: ${path || "the file"} must be a message (a string) or a group of messages`)
  }
  for (const [key, value] of Object.entries(node)) {
    if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error(`${file}: "${path ? `${path}.` : ""}${key}" isn't a valid key (letters, digits, _ and - only)`)
    check(value, path ? `${path}.${key}` : key, file)
  }
}

/** Reads and checks one catalog. */
export function readCatalog(locale, dir = MESSAGES_DIR) {
  const file = `messages/${locale}.yml`
  const messages = parse(readFileSync(join(dir, `${locale}.yml`), "utf8")) ?? {}
  check(messages, "", file)
  return messages
}

export function catalogLocales() {
  return readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith(".yml"))
    .map((f) => f.slice(0, -".yml".length))
    .sort()
}

/** Writes every catalog's JSON, skipping files that haven't changed (so dev doesn't reload for nothing). */
export function buildMessages() {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const locale of catalogLocales()) {
    const out = join(OUT_DIR, `${locale}.json`)
    const json = `${JSON.stringify(readCatalog(locale), null, 2)}\n`
    if (!existsSync(out) || readFileSync(out, "utf8") !== json) writeFileSync(out, json)
  }
}

/** Rebuilds on every change to messages/ (next dev). A broken file logs and keeps the last good JSON. */
let watching = false

export function watchMessages() {
  // Next can load its config more than once; one watcher is enough.
  if (watching) return
  watching = true
  let timer
  watch(MESSAGES_DIR, () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        buildMessages()
      } catch (err) {
        console.error(`[i18n] ${err instanceof Error ? err.message : err}`)
      }
    }, 50)
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    buildMessages()
  } catch (err) {
    console.error(`[i18n] ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}
