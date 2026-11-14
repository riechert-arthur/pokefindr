"use client"

import { FC, ReactNode, useEffect, useRef } from "react"
import { ChevronLeft } from "lucide-react"
import { useTranslations } from "next-intl"
import { useSidebar } from "@/components/providers/SidebarContextProvider"
import { useSessionContext } from "./providers/SessionProvider"
import { can } from "@/lib/auth/entitlements"
import { AppRail, APP_NAV_ID } from "@/components/pokefindr/AppRail"
import { TabBar } from "@/components/pokefindr/TabBar"
import { cn } from "@/lib/utils"

interface SidebarLayoutProps {
  children: ReactNode
}

/**
 * In-app pages: the icon rail, then the page. From `sm` up the rail is part of
 * the layout, so the page (the map included) starts to its right. Below
 * that, the tab bar (#160) sits under the page, so pages end above it, and
 * the rail is a drawer the page's menu button slides in (for Blog,
 * Settings and the rest).
 */
export const SidebarLayout: FC<SidebarLayoutProps> = ({ children }) => {
  const t = useTranslations("nav")
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const { session } = useSessionContext()
  const railRef = useRef<HTMLElement>(null)
  const canModerate = can(session?.role, "moderation.view")
  const isAdmin = can(session?.role, "admin.open")

  // The phone drawer: opening it moves focus in, Escape closes it, and
  // closing it (Escape, the chevron or the menu button) returns focus to
  // whatever opened it, usually the page's menu button.
  useEffect(() => {
    if (!isSidebarOpen) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    railRef.current?.querySelector<HTMLElement>("a, button")?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggleSidebar()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [isSidebarOpen, toggleSidebar])

  return (
    <div className="flex h-dvh flex-col">
      <div className="relative flex min-h-0 flex-1">
        <AppRail
          ref={railRef}
          signedIn={Boolean(session)}
          canModerate={canModerate}
          isAdmin={isAdmin}
          className={cn(
            "z-50 transition-[transform,visibility] duration-300 motion-reduce:transition-none",
            "max-sm:fixed max-sm:inset-y-0 max-sm:left-0 max-sm:shadow-xl",
            // Closed, the drawer is off-screen and invisible, so Tab and screen readers skip it.
            isSidebarOpen ? "max-sm:translate-x-0" : "max-sm:invisible max-sm:-translate-x-full",
          )}
        />

        {isSidebarOpen && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={t("closeNavigation")}
            aria-controls={APP_NAV_ID}
            className="absolute left-56 top-4 z-50 rounded-full bg-card p-2 shadow-md sm:hidden"
          >
            <ChevronLeft className="size-5 text-muted-foreground" aria-hidden />
          </button>
        )}

        {/* relative: pages' absolute headers start at the rail's edge, not under it. */}
        <main className="relative z-10 min-w-0 flex-1 overflow-auto bg-muted/50 dark:bg-background">{children}</main>
      </div>
      <TabBar canAdd canModerate={canModerate} isAdmin={isAdmin} className="sm:hidden" />
    </div>
  )
}
