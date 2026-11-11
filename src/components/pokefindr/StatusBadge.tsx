import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const STATUSES = ["live", "sample", "pending", "sponsored"] as const
export type Status = (typeof STATUSES)[number]

/** Each status's label (in the catalog's `ui.status`) and colors. */
const STYLES: Record<Status, { label: Status; className: string }> = {
  live: { label: "live", className: "border-success/40 text-success" },
  sample: { label: "sample", className: "border-border text-muted-foreground" },
  pending: { label: "pending", className: "border-warning/45 text-warning" },
  sponsored: { label: "sponsored", className: "border-border text-muted-foreground" },
}

interface StatusBadgeProps {
  status: Status
  /** Overrides the default label (e.g. "Sample data"). */
  children?: ReactNode
  className?: string
}

/** Small outlined badge for a status: Live, Sample, Pending review, Sponsored. */
export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  const t = useTranslations("ui.status")
  const s = STYLES[status]
  return (
    <Badge variant="outline" data-status={status} className={cn("h-5 rounded-full bg-background px-2 text-overline uppercase", s.className, className)}>
      {children ?? t(s.label)}
    </Badge>
  )
}
