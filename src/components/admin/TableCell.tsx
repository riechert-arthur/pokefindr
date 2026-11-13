import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

/** A body cell in an admin table (users, reports, jobs). */
export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-3 py-3 align-top text-body", className)} {...props} />
}
