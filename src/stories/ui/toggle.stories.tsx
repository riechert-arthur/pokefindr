import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { LocateFixedIcon } from "lucide-react"
import { Toggle } from "@/components/ui/toggle"

const meta = { title: "UI/Toggle", component: Toggle } satisfies Meta<typeof Toggle>
export default meta
export const Default: StoryObj<typeof meta> = { args: { "aria-label": "Follow my location", children: <LocateFixedIcon /> } }
export const Outline: StoryObj<typeof meta> = { args: { variant: "outline", "aria-label": "Follow my location", children: <LocateFixedIcon /> } }
