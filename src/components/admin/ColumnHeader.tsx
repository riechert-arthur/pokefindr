import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

/** A column header in an admin table (users, reports, jobs). */
export function ColumnHeader({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cn("px-3 py-2.5 text-left text-caption font-semibold text-muted-foreground", className)} {...props} />
}
