import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  /** One or two sentences: what will appear here and how to get it. */
  children?: ReactNode
  /** A button or link, e.g. "Widen to 25 mi" or "Add a place". */
  action?: ReactNode
  className?: string
}

/** Whether a node renders something: 0 does; null, undefined, booleans and "" don't. */
const hasContent = (node: ReactNode) => node != null && typeof node !== "boolean" && node !== ""

/** What a list, panel or tile shows when it has nothing yet. */
export function EmptyState({ icon: Icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-4 text-body", className)}>
      {Icon && (
        <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      )}
      <p className="font-semibold text-foreground">{title}</p>
      {hasContent(children) && <div className="text-muted-foreground">{children}</div>}
      {hasContent(action) && <div className="pt-1">{action}</div>}
    </div>
  )
}
