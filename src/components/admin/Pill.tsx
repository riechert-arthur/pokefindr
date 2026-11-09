import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type PillTone = "ok" | "warn" | "crit" | "idle"

const TONES: Record<PillTone, string> = {
  ok: "bg-success/10 text-success",
  warn: "bg-warning/15 text-warning",
  crit: "bg-destructive/10 text-destructive",
  idle: "bg-muted text-muted-foreground",
}

/** The admin's status pill, as in the prototype: a dot and a short label in the tone's color. */
export function Pill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-semibold", TONES[tone], className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
