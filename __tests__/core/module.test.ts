// @vitest-environment node
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { checkModules, defineModule, moduleProblems, type EntitlementsOf, type ModuleManifest } from "@/core/shell/module"
import { buildRules, CORE_ENTITLEMENTS, can, type Entitlement } from "@/core/access/entitlements"
import { MODULES as REGISTERED } from "@/modules/registry"

/** The registry, typed loosely: it's empty until the first extraction. */
const MODULES: readonly ModuleManifest[] = REGISTERED

const events = defineModule({
  id: "events",
  name: "Events",
  entitlements: {
    "events.view": { audience: "public" },
    "events.manage": { audience: "org" },
    "events.moderate": { audience: "platform", roles: ["moderator", "admin"] },
  },
  roles: { "events.editor": ["events.manage"] },
})
const routes = defineModule({ id: "routes", name: "Routes", requires: ["events"] })

describe("defineModule (#323)", () => {
  it("fills in what a manifest leaves out", () => {
    expect(routes).toEqual({ id: "routes", name: "Routes", requires: ["events"], entitlements: {}, roles: {}, contributes: {} })
  })

  it("keeps ids and entitlement names as literal types", () => {
    const e: EntitlementsOf<typeof events> = "events.manage"
    expect(e).toBe("events.manage")
    // @ts-expect-error: not one of the module's entitlements
    const typo: EntitlementsOf<typeof events> = "events.mange"
    expect(typo).toBeDefined()
  })

  it("rejects, at compile time, names without the module's prefix", () => {
    // @ts-expect-error: "reviews.edit" isn't an events entitlement
    defineModule({ id: "events", name: "Events", entitlements: { "reviews.edit": { audience: "org" } } })
    // @ts-expect-error: a module role must be prefixed too
    defineModule({ id: "events", name: "Events", entitlements: { "events.view": { audience: "public" } }, roles: { editor: ["events.view"] } })
    // @ts-expect-error: a module role can only grant the module's own entitlements
    defineModule({ id: "events", name: "Events", entitlements: { "events.view": { audience: "public" } }, roles: { "events.editor": ["events.manage"] } })
    // @ts-expect-error: platform entitlements name their roles
    defineModule({ id: "events", name: "Events", entitlements: { "events.moderate": { audience: "platform" } } })
  })

  it("makes an unknown entitlement a type error in can()", () => {
    // @ts-expect-error: no such entitlement
    expect(() => can("admin", "reviws.edit")).toThrow()
  })
})

describe("the registry's checks (#323)", () => {
  it("accepts a consistent set of modules", () => {
    expect(moduleProblems([events, routes])).toEqual([])
  })

  it("names every problem: missing requires, duplicate ids, unprefixed or clashing entitlements, unknown roles, cycles", () => {
    const loose = { ...events, id: "events", entitlements: { "reviews.edit": { audience: "org" as const }, "events.x": { audience: "platform" as const, roles: ["owner" as never] } }, roles: { editor: ["events.nope"] } }
    const a = { ...routes, id: "a", requires: ["b"] }
    const b = { ...routes, id: "b", requires: ["a"] }
    expect(moduleProblems([routes])).toEqual([`Module "routes" requires "events", which isn't registered.`])
    expect(moduleProblems([events, events])).toContain(`Module "events" is registered twice.`)
    expect(moduleProblems([loose])).toEqual([
      `Entitlement "reviews.edit" in module "events" must start with "events.".`,
      `Entitlement "events.x" in module "events" names unknown role "owner".`,
      `Module role "editor" in module "events" must start with "events.".`,
      `Module role "editor" grants "events.nope", which module "events" doesn't declare.`,
    ])
    expect(moduleProblems([events], ["events.view"])).toEqual([`Entitlement "events.view" is declared by both core and "events".`])
    expect(moduleProblems([a, b])).toEqual([`Modules require each other in a cycle: a → b → a.`])
  })

  it("refuses to start with a broken registry, with a clear message", () => {
    expect(() => checkModules([routes])).toThrow(/src\/modules\/registry\.ts.*\n- Module "routes" requires "events"/)
    expect(() => buildRules([routes])).toThrow(/requires "events"/)
  })

  it("is consistent as registered", () => {
    expect(moduleProblems(MODULES, Object.keys(CORE_ENTITLEMENTS))).toEqual([])
  })
})

describe("the entitlement table built from manifests (#323)", () => {
  it("is core's entitlements followed by each module's", () => {
    const rules = buildRules([events])
    expect(Object.keys(rules)).toEqual([...Object.keys(CORE_ENTITLEMENTS), "events.view", "events.manage", "events.moderate"])
    expect(rules["events.moderate"]).toEqual({ audience: "platform", roles: ["moderator", "admin"] })
  })

  it("is only core's while no module is registered", () => {
    const names = Object.keys(buildRules(MODULES)) as Entitlement[]
    expect(names).toEqual([...Object.keys(CORE_ENTITLEMENTS), ...MODULES.flatMap((m) => Object.keys(m.entitlements))])
  })
})

// For agents (#323): each module's README is what an agent reads first, so it has to name what the module allows.
describe("module READMEs", () => {
  const missing = (id: string, entitlements: readonly string[], readme: string | null) =>
    readme === null ? [`src/modules/${id}/README.md is missing`] : entitlements.filter((e) => !readme.includes(e)).map((e) => `src/modules/${id}/README.md doesn't name ${e}`)

  it("are checked for every entitlement in the manifest", () => {
    expect(missing("events", Object.keys(events.entitlements), "Owns events. `events.view` is public; `events.manage` for organizations.")).toEqual(["src/modules/events/README.md doesn't name events.moderate"])
    expect(missing("events", [], null)).toEqual(["src/modules/events/README.md is missing"])
  })

  it("exist and name every entitlement, for each registered module", () => {
    const root = path.resolve(__dirname, "../../src/modules")
    const problems = MODULES.flatMap((m) => {
      const file = path.join(root, m.id, "README.md")
      return missing(m.id, Object.keys(m.entitlements), existsSync(file) ? readFileSync(file, "utf8") : null)
    })
    expect(problems).toEqual([])
  })
})
