import { cn } from "@/lib/utils"
import { KINDS, type LocationKind } from "./kinds"

const SIZES = {
  sm: { box: "size-5", icon: "size-3" },
  md: { box: "size-[1.375rem]", icon: "size-3" },
  lg: { box: "size-8 rounded-lg", icon: "size-4" },
} as const

interface KindDotProps {
  kind: LocationKind
  size?: keyof typeof SIZES
  className?: string
  /** Accessible name; omit when the kind is already written next to it. */
  label?: string
}

/** A filled circle in the kind's color with its icon: list rows, popups, chips, cards. */
export function KindDot({ kind, size = "md", className, label }: KindDotProps) {
  const meta = KINDS[kind]
  const Icon = meta.icon
  const s = SIZES[size]
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-kind={kind}
      className={cn("inline-grid shrink-0 place-items-center rounded-full text-primary-foreground", meta.bg, s.box, className)}
    >
      <Icon className={s.icon} aria-hidden strokeWidth={2.25} />
    </span>
  )
}

/** The kind's icon on its own, in the kind's color. */
export function KindIcon({ kind, className }: { kind: LocationKind; className?: string }) {
  const meta = KINDS[kind]
  const Icon = meta.icon
  return <Icon aria-hidden className={cn("size-4", meta.text, className)} />
}
