// @vitest-environment node
import { readdirSync } from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"

const ROOT = path.resolve(__dirname, "../..")

describe("component folders", () => {
  it("keeps src/components/ui to shadcn registry files (kebab-case)", () => {
    const files = readdirSync(path.join(ROOT, "src/components/ui"))
    expect(files.filter((f) => !/^[a-z0-9]+(-[a-z0-9]+)*\.tsx$/.test(f))).toEqual([])
  })

  it("keeps PokeFindr components in src/components/pokefindr (PascalCase)", () => {
    const files = readdirSync(path.join(ROOT, "src/components/pokefindr"))
    expect(files.length).toBeGreaterThan(0)
    expect(files.filter((f) => !/^[A-Z][A-Za-z0-9]*\.tsx$/.test(f))).toEqual([])
  })
})
