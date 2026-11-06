// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
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
        else if (/\.(tsx?|jsx?|mjs|cjs|mdx?)$/.test(name)) files.push(full)
      }
    }
    for (const dir of ["src", "__tests__", "scripts"]) {
      if (existsSync(path.join(ROOT, dir))) walk(path.join(ROOT, dir))
    }
    // Root config files (next.config, tailwind.config, vitest.config, ...).
    for (const name of readdirSync(ROOT)) if (/\.config\.\w+$/.test(name)) files.push(path.join(ROOT, name))
    expect(files.length).toBeGreaterThan(0)
    const hits = files
      .filter((f) => f !== __filename && readFileSync(f, "utf8").includes("@heroicons"))
      .map((f) => path.relative(ROOT, f))
    expect(hits).toEqual([])
  })

  it("doesn't depend on @heroicons/react", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"))
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      expect(pkg[field] ?? {}, field).not.toHaveProperty("@heroicons/react")
    }
    expect(readFileSync(path.join(ROOT, "package-lock.json"), "utf8")).not.toContain("node_modules/@heroicons/")
  })
})
