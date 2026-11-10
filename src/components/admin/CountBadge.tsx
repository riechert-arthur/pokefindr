import type { SectionCount } from "@/components/admin/AdminSidebar"
import { useFormat } from "@/i18n/format"
import { cn } from "@/lib/utils"

/** A section's waiting count, in the page's number format; urgent ones stand out. Shared by /admin's sidebar and /moderate's tabs. */
export function CountBadge({ count, hot, label, className }: SectionCount & { label: string; className?: string }) {
  const f = useFormat()
  return (
    <span
      aria-label={label}
      className={cn(
        "min-w-5 rounded-full px-1.5 text-center text-caption font-semibold tabular-nums",
        hot ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {f.count(count)}
    </span>
  )
}
