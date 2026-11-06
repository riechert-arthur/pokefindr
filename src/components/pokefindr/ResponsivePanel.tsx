"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"
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
const noopSubscribe = () => () => {}

export function ResponsivePanel({ open, onOpenChange, title, description, side = "left", children, className }: ResponsivePanelProps) {
  const desktop = useMediaQuery(MD_UP, true)
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false)
  // Pick Sheet or Drawer when the panel opens and keep it until it next opens:
  // switching while open (a tablet rotating across md) would remount the
  // children and lose input and focus, and switching on close would cut off
  // the exit animation. During hydration the breakpoint isn't known yet, so a
  // panel that's open on load picks once hydration is done.
  const [locked, setLocked] = useState<boolean | null>(null)
  const [wasOpen, setWasOpen] = useState(false)
  if (hydrated && open && (!wasOpen || locked === null)) {
    setWasOpen(true)
    setLocked(desktop)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }
  const sheet = locked ?? desktop
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
