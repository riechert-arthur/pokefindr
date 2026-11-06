"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

/** True while the element's content overflows it, so there's something to scroll. */
function useOverflows(ref: React.RefObject<HTMLElement | null>) {
  const [overflows, setOverflows] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const check = () => setOverflows(el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
    const observer = new ResizeObserver(check)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    check()
    return () => observer.disconnect()
  }, [ref])
  return overflows
}

interface ScrollAreaProps extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  /**
   * Whether the viewport is a tab stop, so keyboard users can scroll it.
   * Defaults to only while the content overflows; pass false when the
   * content's own controls already let keyboard users reach everything.
   */
  focusable?: boolean
}

const ScrollArea = React.forwardRef<React.ElementRef<typeof ScrollAreaPrimitive.Root>, ScrollAreaProps>(
  ({ className, children, focusable, ...props }, ref) => {
    const viewport = React.useRef<HTMLDivElement>(null)
    const overflows = useOverflows(viewport)
    return (
      <ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
        <ScrollAreaPrimitive.Viewport
          ref={viewport}
          tabIndex={focusable ?? overflows ? 0 : undefined}
          className="h-full w-full rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    )
  },
)
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
