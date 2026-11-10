import { describe, expect, it } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "yaml"
import { useTranslations } from "next-intl"
import { render, screen, message } from "../helpers/intl"
import { NotFoundContent } from "@/components/ErrorPage"
import { loadMessages, merge } from "@/i18n/messages"

describe("the message catalogs (#177)", () => {
  it("renders the 404 page from the catalog in each language, with links that keep it", () => {
    render(<NotFoundContent />)
    expect(screen.getByRole("heading", { name: message()("errors.notFound.title") })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Go back home" })).toHaveAttribute("href", "/")
    render(<NotFoundContent />, { locale: "es" })
    expect(screen.getByRole("heading", { name: "Página no encontrada" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/es")
  })

  it("fills a message another language is missing with English", async () => {
    const en = { errors: { notFound: { title: "Page not found", body: "Nothing here." } }, nav: { home: "Home" } }
    const partial = { errors: { notFound: { title: "Página no encontrada" } } }
    expect(merge(en, partial)).toEqual({ errors: { notFound: { title: "Página no encontrada", body: "Nothing here." } }, nav: { home: "Home" } })
    const es = await loadMessages("es")
    expect(es.errors.notFound.title).toBe("Página no encontrada")
    expect(Object.keys(es)).toEqual(Object.keys(await loadMessages("en")))
  })

  it("types the keys, so a typo fails typecheck", () => {
    function Typo() {
      const t = useTranslations()
      // @ts-expect-error: not a key in messages/en.yml
      return <p>{t("errors.notFound.titel")}</p>
    }
    expect(Typo).toBeTypeOf("function")
  })

  it("builds the JSON the app reads from the YAML", async () => {
    const yaml = parse((await import("node:fs")).readFileSync("messages/en.yml", "utf8"))
    expect(await loadMessages("en")).toEqual(yaml)
  })

  it("refuses a catalog with a list or a dotted key", async () => {
    const { readCatalog } = await import("../../scripts/i18n/build.mjs")
    expect(() => readCatalog("en")).not.toThrow()
    const dir = mkdtempSync(join(tmpdir(), "catalog-"))
    writeFileSync(join(dir, "x.yml"), "a:\n  - one\n")
    expect(() => readCatalog("x", dir)).toThrow("messages/x.yml: a must be a message")
    writeFileSync(join(dir, "y.yml"), "a.b: one\n")
    expect(() => readCatalog("y", dir)).toThrow('"a.b" isn\'t a valid key')
  })
})
