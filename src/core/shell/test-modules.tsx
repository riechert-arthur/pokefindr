/**
 * Test modules (#324): one module filling every UI slot, so tests and
 * Storybook can show each core screen with something in its slots. Not in
 * the registry; wrap a tree in `<SlotModules modules={[TEST_MODULE]}>`.
 */
import { defineModule } from "./module"
import { SLOT_NAMES, type UiSlotName } from "./slots"

const UI_SLOTS = SLOT_NAMES.filter((n): n is UiSlotName => !["staff.console.section", "head.meta", "analytics.events", "jobs"].includes(n))

/** A labelled box for slot `name`. */
const box = (name: string) => async () => ({
  default: function TestContribution() {
    return (
      <div data-test-slot={name} className="rounded-md border border-dashed border-border p-3 text-body text-muted-foreground">
        {name}
      </div>
    )
  },
})

/** A contribution that throws when it renders. */
export const throwing = async () => ({
  default: function Broken(): never {
    throw new Error("This contribution is broken on purpose")
  },
})

export const TEST_MODULE = defineModule({
  id: "test",
  name: "Test module",
  contributes: {
    ...Object.fromEntries(UI_SLOTS.map((n) => [n, [{ id: "box", load: box(n) }]])),
    // results.inline renders inside a list.
    "results.inline": [
      {
        id: "box",
        load: async () => ({
          default: function TestItem({ count }: { count: number }) {
            return <li data-test-slot="results.inline">results.inline ({count} results)</li>
          },
        }),
      },
    ],
    "staff.console.section": [{ id: "test", group: "system", label: "Test section", sub: "A module's section.", entitlement: "admin.jobs", load: box("staff.console.section") }],
    "head.meta": { "test-verification": "abc123" },
    "analytics.events": ["test_event"],
  },
})
