"use client"

import { useState, type ReactNode } from "react"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { MD_UP, useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"

interface ResponsivePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Which edge the desktop sheet slides in from. Phones always use a bottom drawer. */
  side?: "left" | "right"
  children: ReactNode
  className?: string
}

/**
 * A side sheet on desktop (≥ md) and a bottom drawer on phones: the pattern
 * the prototype uses for location details, results and the add-a-place flow.
 * Both are dialogs with a required title for screen readers.
 */
export function ResponsivePanel({ open, onOpenChange, title, description, side = "left", children, className }: ResponsivePanelProps) {
  const desktop = useMediaQuery(MD_UP, true)
  // Keep the same kind of panel while it's open. Switching between Sheet and
  // Drawer mid-way (a tablet rotating across md) would remount the children
  // and lose typed input, scroll position and focus.
  const [sheet, setSheet] = useState(desktop)
  if (!open && sheet !== desktop) setSheet(desktop)
  // Without a description, opt out of aria-describedby so Radix doesn't warn.
  const describedBy = description ? {} : { "aria-describedby": undefined }

  if (sheet) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side={side} className={cn("flex w-full flex-col gap-0 p-0 sm:max-w-md", className)} {...describedBy}>
          {/* pr-14 keeps a long title clear of the close button. */}
          <SheetHeader className="border-b border-border p-4 pr-14 text-left">
            <SheetTitle className="text-subheading">{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* dvh, not vh: on mobile vh includes the area behind the browser toolbars. */}
      <DrawerContent className={cn("max-h-[85dvh]", className)} {...describedBy}>
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-subheading">{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
