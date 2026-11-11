// @vitest-environment node
import { describe, expect, it } from "vitest"
import { dependents, withoutModule } from "../../scripts/modules/removal"

const REGISTRY = `import type { ModuleManifest } from "@/core/shell/module"
import ads from "./ads/module"
import events from "./events/module"

export const MODULES = [ads, events] as const satisfies readonly ModuleManifest[]
`

describe("removing a module from the registry (#326)", () => {
  it("drops its import and its entry in the list", () => {
    expect(withoutModule(REGISTRY, "ads")).toBe(`import type { ModuleManifest } from "@/core/shell/module"
import events from "./events/module"

export const MODULES = [events] as const satisfies readonly ModuleManifest[]
`)
    expect(withoutModule(REGISTRY, "events")).toContain("export const MODULES = [ads] as const")
    expect(withoutModule(withoutModule(REGISTRY, "ads"), "events")).toContain("export const MODULES = [] as const")
  })

  it("handles a list over several lines, and the server registry", () => {
    const multi = `import ads from "./ads/module.server"\nimport events from "./events/module.server"\n\nexport const SERVER_MODULES = [\n  ads,\n  events,\n] as const\n`
    expect(withoutModule(multi, "ads")).toBe(`import events from "./events/module.server"\n\nexport const SERVER_MODULES = [\n  events,\n] as const\n`)
  })

  it("refuses a registry that doesn't import the module, unless it's optional", () => {
    expect(() => withoutModule(REGISTRY, "reviews")).toThrow(/isn't imported in the registry/)
    expect(withoutModule(REGISTRY, "reviews", { required: false })).toBe(REGISTRY)
  })
})

describe("what still depends on a removed module (#326)", () => {
  it("lists each file the checks point at, once", () => {
    const output = [
      "src/lib/uses-demo.ts(1,22): error TS2307: Cannot find module '@/modules/zdemo'",
      "./src/app/[locale]/(dashboard)/home/page.tsx:4:1",
      "Module not found: Can't resolve '@/modules/zdemo' in src/components/x.tsx",
      "src/lib/uses-demo.ts(1,22): error TS2307: again",
      " FAIL  __tests__/modules/zdemo.test.ts",
    ].join("\n")
    expect(dependents(output)).toEqual(["src/lib/uses-demo.ts:1", "src/app/[locale]/(dashboard)/home/page.tsx:4", "src/components/x.tsx", "__tests__/modules/zdemo.test.ts"])
  })
})
