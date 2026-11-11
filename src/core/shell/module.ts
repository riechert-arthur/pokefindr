/**
 * What a module is (docs/architecture.md, "The manifest"; #323): one
 * `module.ts` per module, made with `defineModule`, listed in
 * src/modules/registry.ts. Core reads manifests only through the registry.
 *
 * The types keep a manifest honest at compile time: every entitlement and
 * module role is prefixed with the module's id, and module roles only bundle
 * the module's own entitlements. `checkModules` repeats those checks at
 * startup, with the ones types can't do (requires, duplicates).
 */
import { ROLES, type Role } from "@/lib/auth/roles"
import { SLOT_NAMES, type Contributions } from "./slots"

/**
 * Who an entitlement is for.
 * - `public`: anyone, signed in or not.
 * - `org`: anyone acting for an organization whose plan includes the module.
 *   Until organizations exist (#334), that's anyone signed in.
 * - `platform`: PokeFindr staff, by platform role.
 */
export type Audience = "public" | "org" | "platform"

/** One entitlement's rule. Only `platform` entitlements name roles; the others follow from the audience. */
export type EntitlementRule =
  | { readonly audience: "public" | "org"; readonly description?: string }
  | { readonly audience: "platform"; readonly roles: readonly Role[]; readonly description?: string }

/** A module as the registry sees it. `E` is the union of its entitlement names. */
export interface ModuleManifest<Id extends string = string, E extends string = string> {
  readonly id: Id
  /** Shown to people, e.g. in the staff console. */
  readonly name: string
  /** Other modules this one needs. The registry refuses to start without them. */
  readonly requires: readonly string[]
  readonly entitlements: { readonly [K in E]: EntitlementRule }
  /** Module roles an organization admin can grant (#336): each bundles some of this module's entitlements. */
  readonly roles: { readonly [name: string]: readonly E[] }
  /** What it puts in core's slots (src/core/shell/slots.ts). Server-side contributions are in its module.server.ts. */
  readonly contributes: Contributions
  /**
   * Its route files and folders under src/app (Next.js requires routes to
   * live there), e.g. "api/ads". They go when the module is removed
   * (scripts/modules/without.ts, #326).
   */
  readonly routes: readonly string[]
}

/**
 * Declares a module. Ids and entitlement names come out as literal types, so
 * `can(role, "reviws.edit")` is a type error, and an entitlement or module
 * role without the module's prefix doesn't compile.
 */
export function defineModule<const Id extends string, const E extends `${Id}.${string}` = never>(manifest: {
  id: Id
  name: string
  requires?: readonly string[]
  entitlements?: { readonly [K in E]: EntitlementRule }
  roles?: Readonly<Record<`${Id}.${string}`, readonly NoInfer<E>[]>>
  contributes?: Contributions
  routes?: readonly string[]
}): ModuleManifest<Id, E> {
  return {
    id: manifest.id,
    name: manifest.name,
    requires: manifest.requires ?? [],
    entitlements: manifest.entitlements ?? ({} as { readonly [K in E]: EntitlementRule }),
    roles: manifest.roles ?? {},
    contributes: manifest.contributes ?? {},
    routes: manifest.routes ?? [],
  }
}

/** The entitlement names a module declares. */
export type EntitlementsOf<M> = M extends ModuleManifest<string, infer E> ? E : never

/** The ids of a list of modules. */
export type IdsOf<M> = M extends ModuleManifest<infer Id, string> ? Id : never

/**
 * Everything wrong with a set of modules, as sentences. Empty when they're
 * fine. `taken` are entitlement names core already uses.
 */
export function moduleProblems(modules: readonly ModuleManifest[], taken: readonly string[] = []): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  const owner = new Map<string, string>(taken.map((e) => [e, "core"]))
  for (const m of modules) {
    if (!/^[a-z][a-z0-9-]*$/.test(m.id)) problems.push(`Module id "${m.id}" must be lowercase letters, digits and dashes.`)
    if (ids.has(m.id)) problems.push(`Module "${m.id}" is registered twice.`)
    ids.add(m.id)
  }
  for (const m of modules) {
    for (const r of m.requires) if (!ids.has(r)) problems.push(`Module "${m.id}" requires "${r}", which isn't registered.`)
    for (const [e, rule] of Object.entries<EntitlementRule>(m.entitlements)) {
      if (!e.startsWith(`${m.id}.`)) problems.push(`Entitlement "${e}" in module "${m.id}" must start with "${m.id}.".`)
      const other = owner.get(e)
      if (other) problems.push(`Entitlement "${e}" is declared by both ${other === "core" ? "core" : `"${other}"`} and "${m.id}".`)
      owner.set(e, m.id)
      if (rule.audience === "platform") {
        if (rule.roles.length === 0) problems.push(`Platform entitlement "${e}" in module "${m.id}" names no roles.`)
        for (const role of rule.roles) if (!(ROLES as readonly string[]).includes(role)) problems.push(`Entitlement "${e}" in module "${m.id}" names unknown role "${role}".`)
      }
    }
    for (const [role, grants] of Object.entries(m.roles)) {
      if (!role.startsWith(`${m.id}.`)) problems.push(`Module role "${role}" in module "${m.id}" must start with "${m.id}.".`)
      for (const e of grants) if (!Object.hasOwn(m.entitlements, e)) problems.push(`Module role "${role}" grants "${e}", which module "${m.id}" doesn't declare.`)
    }
  }
  // Contributions: known slots, unique ids within a slot, and entitlements that exist.
  for (const m of modules) {
    for (const [slot, value] of Object.entries(m.contributes)) {
      if (!(SLOT_NAMES as readonly string[]).includes(slot)) {
        problems.push(`Module "${m.id}" contributes to "${slot}", which isn't a slot (src/core/shell/slots.ts).`)
        continue
      }
      if (!Array.isArray(value)) continue
      const seen = new Set<string>()
      for (const c of value as readonly { id: string; entitlement?: string }[]) {
        if (seen.has(c.id)) problems.push(`Module "${m.id}" contributes "${c.id}" to "${slot}" twice.`)
        seen.add(c.id)
        if (c.entitlement && !owner.has(c.entitlement)) problems.push(`Module "${m.id}"'s "${c.id}" in "${slot}" needs "${c.entitlement}", which no one declares.`)
      }
    }
  }
  // Route paths: relative to src/app, inside it.
  for (const m of modules) for (const r of m.routes) if (r.startsWith("/") || r.split("/").includes("..") || r === "") problems.push(`Module "${m.id}" has route "${r}", which isn't a path inside src/app.`)
  // A cycle through `requires` would mean neither module can be removed.
  const requires = new Map(modules.map((m) => [m.id, m.requires]))
  const visiting = new Set<string>()
  const done = new Set<string>()
  const visit = (id: string, path: string[]): void => {
    if (done.has(id) || !requires.has(id)) return
    if (visiting.has(id)) {
      problems.push(`Modules require each other in a cycle: ${[...path.slice(path.indexOf(id)), id].join(" → ")}.`)
      return
    }
    visiting.add(id)
    for (const r of requires.get(id)!) visit(r, [...path, id])
    visiting.delete(id)
    done.add(id)
  }
  for (const m of modules) visit(m.id, [])
  return problems
}

/** Throws if the modules are inconsistent, with every problem in the message. Called when the registry loads. */
export function checkModules(modules: readonly ModuleManifest[], taken: readonly string[] = []): void {
  const problems = moduleProblems(modules, taken)
  if (problems.length) throw new Error(`The module registry (src/modules/registry.ts) is broken:\n- ${problems.join("\n- ")}`)
}
