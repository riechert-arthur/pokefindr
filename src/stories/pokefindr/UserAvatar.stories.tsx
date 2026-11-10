import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { UserAvatar, type UserAvatarSize } from "@/components/pokefindr/UserAvatar"

const SIZES: UserAvatarSize[] = ["xs", "sm", "md", "lg"]
// A square picture from public/, served by Storybook's staticDirs.
const PHOTO = "/pokeballpinicon.jpeg"

const meta = {
  title: "PokeFindr/UserAvatar",
  component: UserAvatar,
  args: { name: "misty", size: "md" },
} satisfies Meta<typeof UserAvatar>
export default meta
type Story = StoryObj<typeof meta>

/** No picture: the first letter on the brand color. */
export const Default: Story = {}
/**
 * Every size, as the review rows (xs), admin sidebar (sm), header (md) and settings (lg) use them.
 * Switch the toolbar to dark to compare; CI runs axe on every story in both themes.
 */
export const AllSizes: Story = {
  render: (args) => (
    <div className="grid gap-3">
      {[{ name: "misty" }, { name: "brock", imageUrl: PHOTO }, { name: "🔥blaine" }].map((p) => (
        <div key={p.name} className="flex items-center gap-3 text-body">
          {SIZES.map((size) => <UserAvatar key={size} {...args} {...p} size={size} />)}
          {p.name}
        </div>
      ))}
    </div>
  ),
}
export const WithImage: Story = { args: { imageUrl: PHOTO, size: "lg" } }
/** The picture fails to load: the initial shows instead. */
export const BrokenImage: Story = { args: { imageUrl: "/does-not-exist.png", size: "lg" } }
/** A name that doesn't start with a letter gets a person icon, not a stray symbol. */
export const EmojiName: Story = { args: { name: "🔥blaine", size: "lg" } }
export const SymbolName: Story = { args: { name: "_ash_", size: "lg" } }
/** Next to a name, as in a review row. */
export const InARow: Story = {
  render: (args) => (
    <div className="flex items-center gap-2 text-body">
      <UserAvatar {...args} size="xs" />
      <b className="font-semibold">{args.name}</b>
    </div>
  ),
}
