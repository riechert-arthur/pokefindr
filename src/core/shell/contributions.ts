/**
 * Reading contributions from the registry (#324). Core screens use these
 * instead of importing a feature: `<Slot>` for UI, the lists below for data.
 */
import type { ModuleManifest } from "./module"
import type { StaffSection, UiContribution, UiSlotName, UiSlots } from "./slots"

/** A contribution with the module it came from. */
export type From<C> = C & { readonly module: string }

/** Every module's contributions to a UI slot, by `order` and then registry order. */
export function contributionsTo<N extends UiSlotName>(name: N, modules: readonly ModuleManifest[]): From<UiContribution<UiSlots[N]>>[] {
  return modules
    .flatMap((m) => ((m.contributes[name] ?? []) as readonly UiContribution<UiSlots[N]>[]).map((c) => ({ ...c, module: m.id })))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.order ?? 0) - (b.c.order ?? 0) || a.i - b.i)
    .map(({ c }) => c)
}

/** The staff console's sections from modules. */
export const staffSections = (modules: readonly ModuleManifest[]): From<StaffSection>[] =>
  modules.flatMap((m) => (m.contributes["staff.console.section"] ?? []).map((s) => ({ ...s, module: m.id })))

/** `<meta>` tags for every page, from every module. */
export const headMeta = (modules: readonly ModuleManifest[]): Record<string, string> => Object.assign({}, ...modules.map((m) => m.contributes["head.meta"] ?? {}))

/** Product event names modules send. */
export const analyticsEvents = (modules: readonly ModuleManifest[]): string[] => modules.flatMap((m) => m.contributes["analytics.events"] ?? [])

/** Every module job's name and cron schedule (if it has one). */
export const moduleJobSchedules = (modules: readonly ModuleManifest[]): { name: string; module: string; schedule?: string }[] =>
  modules.flatMap((m) => Object.entries(m.contributes.jobs ?? {}).map(([name, j]) => ({ name, module: m.id, schedule: j.schedule })))
