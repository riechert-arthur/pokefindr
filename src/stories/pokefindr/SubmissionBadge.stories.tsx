import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { SubmissionBadge, SubmissionNote } from "@/components/pokefindr/SubmissionBadge"
import type { MySubmission } from "@/lib/submissions/schemas"

const base: MySubmission = {
  id: "s1",
  kind: "shop",
  status: "pending",
  rejectReason: null,
  name: "Rose City Card Exchange",
  address: "1820 SE Hawthorne Blvd",
  city: "Portland",
  state: "OR",
  lng: -122.64,
  lat: 45.51,
  startsAt: null,
  locationId: null,
  locationActive: null,
  createdAt: "2026-11-01T18:00:00Z",
  reviewedAt: null,
}

/** Every status a submitter sees: the badge, and the line that says what it means. */
function Statuses() {
  const rows: MySubmission[] = [
    base,
    { ...base, id: "s2", status: "approved", locationId: "l2", locationActive: true },
    { ...base, id: "s3", kind: "event", name: "Friday Night Trades", status: "approved", locationId: "l3", locationActive: false },
    { ...base, id: "s4", status: "approved", locationId: "l4", locationActive: false },
    { ...base, id: "s5", status: "rejected", rejectReason: "duplicate" },
  ]
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((s) => (
        <li key={s.id} className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-body font-semibold text-foreground">
            {s.name}
            <SubmissionBadge submission={s} />
          </span>
          <span className="text-body text-muted-foreground">
            <SubmissionNote submission={s} />
          </span>
        </li>
      ))}
    </ul>
  )
}

const meta = {
  title: "PokeFindr/SubmissionBadge",
  component: Statuses,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Statuses>
export default meta
type Story = StoryObj<typeof meta>

/** Pending, live, an ended event, a shop off the map, and one not approved. */
export const AllStatuses: Story = {}
