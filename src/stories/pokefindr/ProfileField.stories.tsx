import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn } from "storybook/test"
import { ProfileField } from "@/components/pokefindr/ProfileField"

type Save = (value: string) => Promise<string | void>

/** A Profile list with one row, which opens and closes like the settings page's. */
function Row({ startEditing = false, ...props }: React.ComponentProps<typeof ProfileField> & { startEditing?: boolean }) {
  const [editing, setEditing] = useState(startEditing)
  const [value, setValue] = useState(props.value)
  return (
    <dl className="w-[36rem] max-w-full divide-y divide-border border-y border-border">
      <ProfileField
        {...props}
        value={value}
        editing={editing}
        onEdit={() => setEditing(true)}
        onCancel={() => setEditing(false)}
        onSave={async (next) => {
          const error = await props.onSave(next)
          if (error) return error
          setValue(next)
          setEditing(false)
        }}
      />
    </dl>
  )
}

const meta = {
  title: "PokeFindr/ProfileField",
  component: ProfileField,
  args: {
    label: "Username",
    value: "misty",
    autoComplete: "username",
    editing: false,
    onEdit: fn(),
    onCancel: fn(),
    onSave: fn<Save>(async () => undefined),
  },
  render: (args) => <Row {...args} />,
} satisfies Meta<typeof ProfileField>
export default meta
type Story = StoryObj<typeof meta>

export const Viewing: Story = {}
export const Editing: Story = { render: (args) => <Row {...args} startEditing /> }
/** Waiting for the server: Save and Cancel are disabled. */
export const Saving: Story = {
  args: { onSave: fn<Save>(() => new Promise<void>(() => {})) },
  render: (args) => <Row {...args} startEditing />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(canvas.getByRole("button", { name: "Saving…" })).toBeDisabled()
  },
}
/** The server refused the change: the error shows under the field. */
export const ServerError: Story = {
  args: { onSave: fn<Save>(async () => "That username is already taken") },
  render: (args) => <Row {...args} startEditing />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("That username is already taken")
  },
}
export const Email: Story = { args: { label: "Email address", value: "misty@example.com", type: "email", autoComplete: "email" } }
