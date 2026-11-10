import { createLucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The logo's pin outline: Logo.tsx's path on its 32 px grid, scaled to 0.7 and
 * centered on lucide's 24 px grid. The stroke is 2 / 0.7 so it draws 2 units
 * wide, like the other icons. AgentMark.test.tsx checks the path still matches
 * the logo's.
 */
const PIN = "M16 1.5c-6.4 0-11.5 5-11.5 11.3 0 7.9 9.5 16.6 10.5 17.4a1.4 1.4 0 0 0 2 0c1-.8 10.5-9.5 10.5-17.4C27.5 6.5 22.4 1.5 16 1.5z"

/**
 * The logo's pin, talking (#303): its head holds three typing dots where the
 * logo has the card. Drawn in lucide's style (24 × 24, 2 px round strokes, one
 * color), so it takes color and size like any other icon.
 */
const AgentPinIcon = createLucideIcon("AgentPin", [
  ["path", { d: PIN, transform: "translate(.8 .95) scale(.7)", strokeWidth: String(2 / 0.7), key: "pin" }],
  ["circle", { cx: "8.5", cy: "10", r: "1.25", fill: "currentColor", stroke: "none", key: "dot1" }],
  ["circle", { cx: "12", cy: "10", r: "1.25", fill: "currentColor", stroke: "none", key: "dot2" }],
  ["circle", { cx: "15.5", cy: "10", r: "1.25", fill: "currentColor", stroke: "none", key: "dot3" }],
])

/** Box and glyph per size: 26, 34 and 44 px, with the glyph about 60% of the box. */
const SIZES = {
  sm: "size-[26px] rounded-lg [&_svg]:size-4",
  md: "size-[34px] rounded-[10px] [&_svg]:size-5",
  lg: "size-11 rounded-xl [&_svg]:size-[26px]",
} as const

/**
 * The assistant's mark: the logo's pin, talking, on the logo's gradient
 * (#303). The glyph is primary-foreground, which keeps 4.5:1 on both brand
 * colors in light and dark (__tests__/design/tokens.test.ts). It's hidden from
 * screen readers, so it doesn't tell them who is speaking: whatever does
 * that has to be text.
 */
export function AgentMark({ size = "md", className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden className={cn("grid flex-none place-items-center bg-gradient-to-br from-brand to-brand-2 text-primary-foreground", SIZES[size], className)}>
      <AgentPinIcon />
    </span>
  )
}
