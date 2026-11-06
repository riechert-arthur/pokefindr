import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Textarea } from "@/components/ui/textarea"

const meta = { title: "UI/Textarea", component: Textarea, args: { placeholder: "What did you find? Stock, restock day, where the machine is in the store…", className: "w-96", "aria-label": "Review" } } satisfies Meta<typeof Textarea>
export default meta
export const Default: StoryObj<typeof meta> = {}
