"use client"

import { cn } from "@/lib/utils"
import { KINDS, formatCount, type LocationKind } from "./kinds"

interface TypeChipProps {
  kind: LocationKind
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  /** Shown after the label, e.g. how many of this kind are on the map. */
  count?: number
  /** Short label for tight rows ("Vending" instead of "Vending machines"). */
  short?: boolean
  className?: string
}

/**
 * A toggle chip for showing or hiding one location kind. Off: muted swatch
 * and text. On: the swatch fills with the kind's color and the border darkens.
 */
export function TypeChip({ kind, pressed, onPressedChange, count, short, className }: TypeChipProps) {
  const meta = KINDS[kind]
  const Icon = meta.icon
  const label = short ? meta.short : meta.label
  return (
    <button
      type="button"
      aria-pressed={pressed}
      // Starts with the visible text, so voice control ("click Vending 1,457") matches.
      aria-label={count === undefined ? label : `${label} ${formatCount(count)}`}
      onClick={() => onPressedChange(!pressed)}
      data-kind={kind}
      className={cn(
        "inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full border bg-card pl-1.5 pr-3 text-body font-medium shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-[1.125rem] place-items-center rounded-full text-primary-foreground transition-opacity",
          pressed ? meta.bg : "bg-muted-foreground opacity-45",
        )}
      >
        <Icon className="size-[0.6875rem]" strokeWidth={2.5} />
      </span>
      {label}
      {count !== undefined && <span className="text-caption tabular-nums text-muted-foreground">{formatCount(count)}</span>}
    </button>
  )
}
