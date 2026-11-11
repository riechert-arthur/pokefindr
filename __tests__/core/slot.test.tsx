import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "../helpers/intl"
import { Slot, SlotModules } from "@/core/shell/Slot"
import { defineModule, moduleProblems, type ModuleManifest } from "@/core/shell/module"
import { TEST_MODULE, throwing } from "@/core/shell/test-modules"
import { contributionsTo, headMeta, analyticsEvents, staffSections } from "@/core/shell/contributions"
import { SLOT_NAMES } from "@/core/shell/slots"
import { CORE_ENTITLEMENTS } from "@/core/access/entitlements"
import { withModuleSections, type AdminGroup } from "@/lib/admin/sections"

const viewer = vi.hoisted(() => ({ role: null as string | null }))
vi.mock("@/components/providers/session-context", () => ({ useOptionalSession: () => (viewer.role ? { role: viewer.role } : null) }))

afterEach(() => {
  cleanup()
  viewer.role = null
})

const text = (t: string) => async () => ({ default: () => <p>{t}</p> })
const tiles = (...cs: { id: string; order?: number; entitlement?: string; load: () => Promise<{ default: () => React.JSX.Element }> }[]) =>
  defineModule({ id: "tiles", name: "Tiles", contributes: { "dashboard.tile": cs } })

const show = (modules: readonly ModuleManifest[], role?: string) => {
  viewer.role = role ?? null
  return render(
    <SlotModules modules={modules}>
      <Slot name="dashboard.tile" props={{}} />
      <p>after the slot</p>
    </SlotModules>,
  )
}

describe("<Slot> (#324)", () => {
  it("renders nothing when no module contributes", () => {
    const { container } = show([])
    expect(container.textContent).toBe("after the slot")
  })

  it("loads each contribution lazily, by order then registry order", async () => {
    show([tiles({ id: "b", order: 2, load: text("B") }, { id: "a", order: 1, load: text("A") }), defineModule({ id: "more", name: "More", contributes: { "dashboard.tile": [{ id: "c", order: 1, load: text("C") }] } })])
    await screen.findByText("B")
    expect([...document.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["A", "C", "B", "after the slot"])
  })

  it("leaves out contributions the viewer lacks the entitlement for", async () => {
    const modules = [tiles({ id: "staff", entitlement: "admin.jobs", load: text("Staff only") }, { id: "all", load: text("Everyone") })]
    show(modules)
    await screen.findByText("Everyone")
    expect(screen.queryByText("Staff only")).toBeNull()
    cleanup()
    show(modules, "admin")
    expect(await screen.findByText("Staff only")).toBeInTheDocument()
  })

  it("hides a contribution gated by an entitlement no one declares (a removed module's)", async () => {
    show([tiles({ id: "gone", entitlement: "nobody.has", load: text("Hidden") }, { id: "all", load: text("Shown") })])
    await screen.findByText("Shown")
    expect(screen.queryByText("Hidden")).toBeNull()
  })

  it("keeps one contribution's failure inside it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    show([tiles({ id: "boom", load: throwing }, { id: "fine", load: text("Fine") })])
    expect(await screen.findByText("Fine")).toBeInTheDocument()
    expect(screen.getByText("after the slot")).toBeInTheDocument()
    expect(document.querySelector('[data-slot-failed="dashboard.tile tiles:boom"]')).not.toBeNull()
    vi.restoreAllMocks()
  })

  it("is filled in every UI slot by the test module", async () => {
    expect(moduleProblems([TEST_MODULE], Object.keys(CORE_ENTITLEMENTS))).toEqual([])
    for (const name of ["location.details.section", "landing.section", "map.layer", "map.action", "dashboard.tile", "settings.section", "legal.privacy.section"] as const) {
      expect(contributionsTo(name, [TEST_MODULE]).map((c) => c.id), name).toEqual(["box"])
    }
    expect(contributionsTo("results.inline", [TEST_MODULE])).toHaveLength(1)
  })
})

describe("data slots (#324)", () => {
  it("collect staff sections, head tags and analytics events", () => {
    expect(staffSections([TEST_MODULE]).map((s) => [s.module, s.id, s.group])).toEqual([["test", "test", "system"]])
    expect(headMeta([TEST_MODULE])).toEqual({ "test-verification": "abc123" })
    expect(analyticsEvents([TEST_MODULE])).toEqual(["test_event"])
  })

  it("add a module's staff section to its group, or a new group", () => {
    const core: AdminGroup[] = [{ id: "system", label: "System", sections: [{ id: "jobs", label: "Jobs", sub: "", entitlement: "admin.jobs" }] }]
    expect(withModuleSections(core, [TEST_MODULE])[0].sections.map((s) => s.id)).toEqual(["jobs", "test"])
    const elsewhere = defineModule({ id: "x", name: "X", contributes: { "staff.console.section": [{ id: "x", group: "partners", label: "X", sub: "", entitlement: "admin.jobs", load: text("X") }] } })
    expect(withModuleSections(core, [elsewhere]).map((g) => [g.id, g.label])).toEqual([["system", "System"], ["partners", "Partners"]])
  })

  it("refuses contributions to an unknown slot, duplicate ids, or an undeclared entitlement", () => {
    const bad = { ...TEST_MODULE, id: "bad", contributes: { "nope.slot": [], "dashboard.tile": [{ id: "a", load: text("a") }, { id: "a", entitlement: "ghost.view", load: text("b") }] } } as unknown as ModuleManifest
    expect(moduleProblems([bad], ["admin.jobs"])).toEqual([
      `Module "bad" contributes to "nope.slot", which isn't a slot (src/core/shell/slots.ts).`,
      `Module "bad" contributes "a" to "dashboard.tile" twice.`,
      `Module "bad"'s "a" in "dashboard.tile" needs "ghost.view", which no one declares.`,
    ])
  })

  it("lists every slot the issue asks for", () => {
    expect([...SLOT_NAMES].sort()).toEqual(
      ["location.details.section", "results.inline", "landing.section", "map.layer", "map.action", "dashboard.tile", "staff.console.section", "settings.section", "head.meta", "legal.privacy.section", "analytics.events", "jobs"].sort(),
    )
  })
})
