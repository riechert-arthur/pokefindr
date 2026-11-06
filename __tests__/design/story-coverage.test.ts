import { readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = join(__dirname, "..", "..")
const names = (dir: string, ext: RegExp) =>
  readdirSync(join(root, dir)).filter((f) => ext.test(f)).map((f) => f.replace(ext, ""))

// Every shared component gets a story, so Storybook stays the catalogue.
describe("story coverage", () => {
  it("has a story for every shadcn component in src/components/ui", () => {
    const stories = new Set(names("src/stories/ui", /\.stories\.tsx$/))
    const missing = names("src/components/ui", /\.tsx$/).filter((n) => !stories.has(n))
    expect(missing).toEqual([])
  })

  it("has a story for every PokeFindr component", () => {
    const stories = new Set(names("src/stories/pokefindr", /\.stories\.tsx$/))
    const missing = names("src/components/pokefindr", /\.tsx$/).filter((n) => !stories.has(n))
    expect(missing).toEqual([])
  })
})
