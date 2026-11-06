"use client"

import { useState, type ReactNode } from "react"
import { X } from "lucide-react"
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  /** Desktop only: dim and block the page behind the sheet. Phones always use a modal drawer. */
  modal?: boolean
  children: ReactNode
  className?: string
}

/**
 * A side sheet on desktop (≥ md) and a bottom drawer on phones: the pattern
 * the prototype uses for location details, results and the add-a-place flow.
 * Both are dialogs with a required title for screen readers. The desktop
 * sheet is non-modal by default, so the map beside it stays usable.
 */
export function ResponsivePanel({
  open,
  onOpenChange,
  title,
  description,
  side = "left",
  modal = false,
  children,
  className,
}: ResponsivePanelProps) {
  // undefined until hydration, when the breakpoint isn't known yet.
  const desktop = useMediaQuery(MD_UP)
  // Pick Sheet or Drawer when the panel opens and keep it until it next opens:
  // switching while open (a tablet rotating across md) would remount the
  // children and lose input and focus, and switching on close would cut off
  // the exit animation.
  const [locked, setLocked] = useState<boolean | undefined>(undefined)
  const [wasOpen, setWasOpen] = useState(false)
  if (desktop !== undefined && open && !wasOpen) {
    setWasOpen(true)
    setLocked(desktop)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }
  // Without a description, opt out of aria-describedby so Radix doesn't warn.
  const describedBy = description ? {} : { "aria-describedby": undefined }

  // Before hydration, render nothing rather than guess: a panel that's open on
  // load would otherwise mount the wrong kind first (dialogs portal to <body>,
  // so there's no server markup to match anyway).
  if (desktop === undefined) return null
  const sheet = locked ?? desktop

  if (sheet) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
        <SheetContent side={side} className={cn("flex w-full flex-col gap-0 p-0 sm:max-w-md", className)} {...describedBy}>
          {/* pr-14 keeps a long title clear of the close button. */}
          <SheetHeader className="border-b border-border p-4 pr-14 text-left">
            <SheetTitle className="text-subheading">{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">{children}</div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    )
  }

  // Phones keep the browser's native scrolling, which plays well with vaul's drag.
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* dvh, not vh: on mobile vh includes the area behind the browser toolbars. */}
      <DrawerContent className={cn("max-h-[85dvh]", className)} {...describedBy}>
        <DrawerHeader className="flex items-start justify-between gap-4 text-left">
          <div className="grid gap-1.5">
            <DrawerTitle className="text-subheading">{title}</DrawerTitle>
            {description ? <DrawerDescription>{description}</DrawerDescription> : null}
          </div>
          {/* Swipe and Escape aren't available to everyone: give the drawer a close button. */}
          <DrawerClose className="-m-2 rounded-md p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-5" aria-hidden />
            <span className="sr-only">Close</span>
          </DrawerClose>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
