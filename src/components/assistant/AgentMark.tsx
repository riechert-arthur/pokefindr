import { SparkleIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const SIZES = {
  sm: "size-[26px] rounded-lg [&_svg]:size-3.5",
  md: "size-[34px] rounded-[10px] [&_svg]:size-[18px]",
  lg: "size-11 rounded-xl [&_svg]:size-[18px]",
} as const

/** The assistant's mark from the prototype: a white sparkle on the logo gradient. */
export function AgentMark({ size = "md", className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden className={cn("grid flex-none place-items-center bg-gradient-to-br from-brand to-brand-2 text-white", SIZES[size], className)}>
      <SparkleIcon className="fill-current stroke-none" />
    </span>
  )
}
