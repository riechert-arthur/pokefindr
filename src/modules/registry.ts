/**
 * The only list of the modules built into the app (docs/architecture.md, #323).
 * Add a module by importing its manifest here; remove one by deleting its
 * folder, its route files and its line here. Core reaches modules only
 * through this list (and the slots that read it).
 *
 * Empty until the first module is extracted (ads, #327). The order is the
 * order their entitlements are listed and their slot contributions render.
 */
import type { ModuleManifest } from "@/core/shell/module"

export const MODULES = [] as const satisfies readonly ModuleManifest[]

/** The id of a built-in module. */
export type ModuleId = (typeof MODULES)[number] extends ModuleManifest<infer Id, string> ? Id : never
