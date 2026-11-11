"use client"

/**
 * `<Slot name props>` (#324): renders what the registered modules contribute
 * to a UI slot (src/core/shell/slots.ts), so a core screen names a place, not
 * a feature. Each contribution:
 * - loads lazily, so a page only downloads the modules it shows;
 * - renders in a stable order (`order`, then registry order);
 * - is left out when the viewer lacks its `entitlement` (`can()`);
 * - is inside its own error boundary, so one module failing can't break the page.
 * With no contributions it renders nothing.
 */
import { Component, createContext, lazy, Suspense, useContext, type ComponentType, type ErrorInfo, type ReactNode } from "react"
import { useOptionalSession } from "@/components/providers/session-context"
import { can, type Entitlement } from "@/core/access/entitlements"
import type { Role } from "@/lib/auth/roles"
import { MODULES } from "@/modules/registry"
import { contributionsTo } from "./contributions"
import type { ModuleManifest } from "./module"
import type { UiContribution, UiSlotName, UiSlots } from "./slots"

/** The modules slots read: the registry, or test modules in tests and Storybook. */
const ModulesContext = createContext<readonly ModuleManifest[]>(MODULES)

/** Renders `children` with `modules` in place of the registry: for tests and stories. */
export function SlotModules({ modules, children }: { modules: readonly ModuleManifest[]; children: ReactNode }) {
  return <ModulesContext.Provider value={modules}>{children}</ModulesContext.Provider>
}

/** One lazy component per loader, so re-renders don't load it again. */
const lazies = new WeakMap<() => Promise<{ default: ComponentType<never> }>, ComponentType<never>>()
function lazyOf<P>(load: UiContribution<P>["load"]): ComponentType<P> {
  let c = lazies.get(load as never)
  if (!c) lazies.set(load as never, (c = lazy(load as never) as ComponentType<never>))
  return c as ComponentType<P>
}

/** Keeps one contribution's failure (loading or rendering) inside it. */
class ContributionBoundary extends Component<{ id: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[slot] ${this.props.id} failed`, error, info.componentStack)
  }
  render() {
    return this.state.failed ? <span hidden data-slot-failed={this.props.id} /> : this.props.children
  }
}

/** Whether the viewer may see a contribution. An entitlement no one declares (a removed module's) hides it. */
function allowed(role: Role | null, entitlement: string | undefined): boolean {
  if (!entitlement) return true
  try {
    return can(role, entitlement as Entitlement)
  } catch {
    return false
  }
}

/** One lazily loaded contribution, inside its own error boundary. Also used for staff console sections. */
export function ModuleContribution<P extends object>({ id, load, props, fallback = null }: { id: string; load: UiContribution<P>["load"]; props: P; fallback?: ReactNode }) {
  const Contribution = lazyOf(load)
  return (
    <ContributionBoundary id={id}>
      <Suspense fallback={fallback}>
        <Contribution {...props} />
      </Suspense>
    </ContributionBoundary>
  )
}

export function Slot<N extends UiSlotName>({ name, props, fallback = null }: { name: N; props: UiSlots[N]; fallback?: ReactNode }) {
  const modules = useContext(ModulesContext)
  const role = useOptionalSession()?.role ?? null
  const shown = contributionsTo(name, modules).filter((c) => allowed(role, c.entitlement))
  if (shown.length === 0) return null
  return (
    <>
      {shown.map((c) => (
        <ModuleContribution key={`${c.module}:${c.id}`} id={`${name} ${c.module}:${c.id}`} load={c.load} props={props} fallback={fallback} />
      ))}
    </>
  )
}
