// @vitest-environment node
import { readdirSync } from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"

const ROOT = path.resolve(__dirname, "../..")

describe("component folders", () => {
  it("keeps src/components/ui to shadcn registry files (kebab-case)", () => {
    // Files and folders, any depth: shadcn components can ship .ts helpers or hooks.
    const bad: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/
        if (entry.isDirectory()) {
          if (!kebab.test(entry.name)) bad.push(entry.name)
          walk(path.join(dir, entry.name))
        } else if (!/^[a-z0-9]+(-[a-z0-9]+)*\.tsx?$/.test(entry.name)) {
          bad.push(entry.name)
        }
      }
    }
    walk(path.join(ROOT, "src/components/ui"))
    expect(bad).toEqual([])
  })

  it("keeps PokeFindr components in src/components/pokefindr (PascalCase)", () => {
    const files = readdirSync(path.join(ROOT, "src/components/pokefindr"))
    expect(files.length).toBeGreaterThan(0)
    expect(files.filter((f) => !/^[A-Z][A-Za-z0-9]*\.tsx$/.test(f))).toEqual([])
  })
})
