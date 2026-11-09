import type { Locale } from "./routing"
import type en from "./generated/en.json"

export type Messages = typeof en

export type Tree = { [key: string]: string | Tree }

/** `fallback` with `messages` on top, so a message a translation is missing shows in English. */
export function merge(fallback: Tree, messages: Tree): Tree {
  const out: Tree = { ...fallback }
  for (const [key, value] of Object.entries(messages)) {
    const base = out[key]
    out[key] = typeof value === "object" && typeof base === "object" ? merge(base, value) : value
  }
  return out
}

/**
 * A language's catalog (built from messages/<locale>.yml, docs/i18n.md). CI
 * checks every catalog has every message; the English fallback only covers a
 * catalog that's still being written.
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const en = (await import("./generated/en.json")).default as Tree
  if (locale === "en") return en as Messages
  const own = (await import(`./generated/${locale}.json`)).default as Tree
  return merge(en, own) as Messages
}
