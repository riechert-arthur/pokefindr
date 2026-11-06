// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = join(__dirname, "..", "..")
const names = (dir: string, ext: RegExp) =>
  readdirSync(join(root, dir)).filter((f) => ext.test(f)).map((f) => f.replace(ext, ""))

// Component folders and where their stories live (brand components, like
// Logo, sit with the PokeFindr stories).
const GROUPS = [
  { components: "src/components/ui", stories: "src/stories/ui" },
  { components: "src/components/pokefindr", stories: "src/stories/pokefindr" },
  { components: "src/components/brand", stories: "src/stories/pokefindr" },
]

// Every shared component gets a story that renders it, so Storybook stays the catalogue.
describe("story coverage", () => {
  it.each(GROUPS)("has a story importing each component in $components", ({ components, stories }) => {
    const problems = names(components, /\.tsx$/).flatMap((name) => {
      const story = join(root, stories, `${name}.stories.tsx`)
      if (!existsSync(story)) return [`${name}: no story`]
      const imports = readFileSync(story, "utf8").includes(`from "@/${components.replace(/^src\//, "")}/${name}"`)
      return imports ? [] : [`${name}: story doesn't import the component`]
    })
    expect(problems).toEqual([])
  })

  it.each(["src/stories/ui", "src/stories/pokefindr"])("has no story without a component in %s", (stories) => {
    const components = new Set(
      GROUPS.filter((g) => g.stories === stories).flatMap((g) => names(g.components, /\.tsx$/)),
    )
    expect(names(stories, /\.stories\.tsx$/).filter((n) => !components.has(n))).toEqual([])
  })
})
