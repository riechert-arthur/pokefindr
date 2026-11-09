import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

const meta = { title: "UI/Switch", component: Switch } satisfies Meta<typeof Switch>
export default meta

const SETTINGS = [
  { id: "alerts", name: "Restock alerts near me", on: true },
  { id: "events", name: "New events this week", on: false },
]

export const Settings: StoryObj<typeof meta> = {
  render: () => (
    <div className="grid max-w-sm gap-3">
      {SETTINGS.map(({ id, name, on }) => (
        <div key={id} className="flex items-center justify-between gap-3 text-body">
          <Label htmlFor={id}>{name}</Label>
          <Switch id={id} defaultChecked={on} />
        </div>
      ))}
    </div>
  ),
}

export const Disabled: StoryObj<typeof meta> = {
  render: () => (
    <div className="flex items-center gap-3 text-body">
      <Switch id="sync" disabled />
      <Label htmlFor="sync">Location sync (waiting on a data source)</Label>
    </div>
  ),
}
