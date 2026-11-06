import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type Status = "live" | "sample" | "pending" | "coming-soon" | "sponsored"

const STYLES: Record<Status, { label: string; className: string }> = {
  live: { label: "Live", className: "border-success/40 text-success" },
  sample: { label: "Sample", className: "border-border text-muted-foreground" },
  pending: { label: "Pending review", className: "border-warning/45 text-warning" },
  "coming-soon": { label: "Coming soon", className: "border-dashed border-border text-muted-foreground" },
  sponsored: { label: "Sponsored", className: "border-border text-muted-foreground" },
}

interface StatusBadgeProps {
  status: Status
  /** Overrides the default label (e.g. "Sample data"). */
  children?: ReactNode
  className?: string
}

/** Small outlined badge for a status: Live, Sample, Pending review, Coming soon, Sponsored. */
export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  const s = STYLES[status]
  return (
    <Badge variant="outline" data-status={status} className={cn("h-5 rounded-full bg-background px-2 text-overline uppercase", s.className, className)}>
      {children ?? s.label}
    </Badge>
  )
}
