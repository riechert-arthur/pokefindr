// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"

const ROOT = path.resolve(__dirname, "../..")

describe("icons", () => {
  it("uses lucide-react only (no heroicons imports)", () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(tsx?|jsx?|mdx?)$/.test(name)) files.push(full)
      }
    }
    walk(path.join(ROOT, "src"))
    expect(files.length).toBeGreaterThan(0)
    const hits = files.filter((f) => readFileSync(f, "utf8").includes("@heroicons")).map((f) => path.relative(ROOT, f))
    expect(hits).toEqual([])
  })

  it("doesn't depend on @heroicons/react", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"))
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty("@heroicons/react")
  })
})
