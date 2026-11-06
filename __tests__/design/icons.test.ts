// @vitest-environment node
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"

const ROOT = path.resolve(__dirname, "../..")

describe("icons", () => {
  it("uses lucide-react only (no heroicons imports)", () => {
    const hits = execSync("grep -rln '@heroicons' src || true", { cwd: ROOT, encoding: "utf8" }).trim()
    expect(hits).toBe("")
  })

  it("doesn't depend on @heroicons/react", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"))
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty("@heroicons/react")
  })
})
