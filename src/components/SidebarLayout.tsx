"use client"

import { FC, ReactNode, useEffect, useRef } from "react"
import { ChevronLeft } from "lucide-react"
import { useSidebar } from "@/components/providers/SidebarContextProvider"
import { useSessionContext } from "./providers/SessionProvider"
import { AppRail, APP_NAV_ID } from "@/components/pokefindr/AppRail"
import { cn } from "@/lib/utils"

interface SidebarLayoutProps {
  children: ReactNode
}

/**
 * In-app pages: the icon rail, then the page. From `sm` up the rail is part of
 * the layout, so the page (the map included) starts to its right. Below
 * that it's a drawer the page's menu button slides in, until the phone tab
 * bar (#160) replaces it.
 */
export const SidebarLayout: FC<SidebarLayoutProps> = ({ children }) => {
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const { session } = useSessionContext()
  const railRef = useRef<HTMLElement>(null)

  // The phone drawer: Escape closes it, and opening it moves focus into it.
  useEffect(() => {
    if (!isSidebarOpen) return
    railRef.current?.querySelector<HTMLElement>("a, button")?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggleSidebar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isSidebarOpen, toggleSidebar])

  return (
    <div className="relative flex h-screen">
      <AppRail
        ref={railRef}
        signedIn={Boolean(session)}
        className={cn(
          "z-50 transition-[transform,visibility] duration-300",
          "max-sm:fixed max-sm:inset-y-0 max-sm:left-0 max-sm:shadow-xl",
          // Closed, the drawer is off-screen and invisible, so Tab and screen readers skip it.
          isSidebarOpen ? "max-sm:translate-x-0" : "max-sm:invisible max-sm:-translate-x-full",
        )}
      />

      {isSidebarOpen && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Close navigation"
          aria-controls={APP_NAV_ID}
          className="absolute left-20 top-4 z-50 rounded-full bg-card p-2 shadow-md sm:hidden"
        >
          <ChevronLeft className="size-5 text-muted-foreground" aria-hidden />
        </button>
      )}

      {/* relative: pages' absolute headers start at the rail's edge, not under it. */}
      <main className="relative z-10 min-w-0 flex-1 overflow-auto bg-muted/50 dark:bg-background">{children}</main>
    </div>
  )
}
