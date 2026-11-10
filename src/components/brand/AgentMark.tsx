import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { AgentPinIcon } from "./agent-glyphs"

/** Box and glyph per size: 26, 34 and 44 px, with the glyph about 60% of the box. */
const SIZES = {
  sm: "size-[26px] rounded-lg [&_svg]:size-4",
  md: "size-[34px] rounded-[10px] [&_svg]:size-5",
  lg: "size-11 rounded-xl [&_svg]:size-[26px]",
} as const

/**
 * The assistant's mark: the logo's pin, talking, on the logo's gradient
 * (#303). The glyph is primary-foreground, which keeps 4.5:1 on both brand
 * colors in light and dark (__tests__/design/tokens.test.ts). Decorative: the
 * text next to it says who is speaking.
 */
export function AgentMark({
  size = "md",
  className,
  glyph: Glyph = AgentPinIcon,
}: {
  size?: keyof typeof SIZES
  className?: string
  /** Only for comparing the candidate glyphs in Storybook (agent-glyphs.ts). */
  glyph?: LucideIcon
}) {
  return (
    <span aria-hidden className={cn("grid flex-none place-items-center bg-gradient-to-br from-brand to-brand-2 text-primary-foreground", SIZES[size], className)}>
      <Glyph />
    </span>
  )
}
