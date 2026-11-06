import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { useState } from "react"
import { StarRating } from "@/components/pokefindr/StarRating"

const meta = { title: "PokeFindr/StarRating", component: StarRating, args: { rating: 3.5, starSize: 20 } } satisfies Meta<typeof StarRating>
export default meta
type Story = StoryObj<typeof meta>
export const ReadOnly: Story = {}
function RatingInput() {
  const [v, setV] = useState(0)
  return <StarRating rating={v} onChange={setV} label="Your rating" starSize={26} />
}

export const Input: Story = { render: () => <RatingInput /> }
