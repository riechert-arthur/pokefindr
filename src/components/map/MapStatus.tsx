import type { ReactNode } from "react"
import { LoaderCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MapStatusProps {
  /** "loading" while the map starts; "error" when it can't. */
  kind: "loading" | "error"
  children: ReactNode
  className?: string
}

/**
 * What fills the map area while the map loads or after it fails: muted,
 * centered text on the map's land color, as in the redesign prototype.
 */
export function MapStatus({ kind, children, className }: MapStatusProps) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "grid size-full place-items-center bg-map-land p-6 text-center text-body text-muted-foreground",
        className,
      )}
    >
      <div className="flex max-w-sm flex-col items-center gap-3">
        {kind === "loading" && <LoaderCircleIcon className="size-6 animate-spin text-primary" aria-hidden />}
        <p>{children}</p>
        {kind === "error" && (
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
        )}
      </div>
    </div>
  )
}
