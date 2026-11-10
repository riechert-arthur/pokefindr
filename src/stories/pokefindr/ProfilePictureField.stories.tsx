import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn } from "storybook/test"
import { ProfilePictureField } from "@/components/pokefindr/ProfilePictureField"

type Action = () => Promise<string | void>
const PHOTO = "/pokeballpinicon.jpeg"

/** The row in a Profile list, keeping the picture it's given like the settings page does. */
function Row(props: React.ComponentProps<typeof ProfilePictureField>) {
  const [image, setImage] = useState(props.image)
  return (
    <dl className="w-[36rem] max-w-full divide-y divide-border border-y border-border">
      <ProfilePictureField
        {...props}
        image={image}
        onUpload={async (file) => {
          const error = await props.onUpload(file)
          if (!error) setImage(PHOTO)
          return error
        }}
        onRemove={async () => {
          const error = await props.onRemove()
          if (!error) setImage(null)
          return error
        }}
      />
    </dl>
  )
}

const meta = {
  title: "PokeFindr/ProfilePictureField",
  component: ProfilePictureField,
  args: { name: "misty", image: null, onUpload: fn(async () => undefined), onRemove: fn<Action>(async () => undefined) },
  render: (args) => <Row {...args} />,
} satisfies Meta<typeof ProfilePictureField>
export default meta
type Story = StoryObj<typeof meta>

/** No picture yet: initials, and only Upload. */
export const NoPicture: Story = {}
export const WithPicture: Story = { args: { image: PHOTO } }
/** Removing: the server is still answering. */
export const Removing: Story = {
  args: { image: PHOTO, onRemove: fn<Action>(() => new Promise<void>(() => {})) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove photo" }))
    await expect(canvas.getByRole("button", { name: "Removing…" })).toBeDisabled()
  },
}
/** The server refused the file: its reason shows under the row. */
export const Refused: Story = {
  args: { image: PHOTO, onRemove: fn<Action>(async () => "Profile pictures aren't available right now.") },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove photo" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Profile pictures aren't available right now.")
  },
}
