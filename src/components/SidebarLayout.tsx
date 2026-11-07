"use client"

import { FC, ReactNode } from "react"
import { ChevronLeft } from "lucide-react"
import { useSidebar } from "@/components/providers/SidebarContextProvider"
import { useSessionContext } from "./providers/SessionProvider"
import { AppRail } from "@/components/pokefindr/AppRail"
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

  return (
    <div className="relative flex h-screen">
      <AppRail
        signedIn={Boolean(session)}
        className={cn(
          "z-50 transition-transform duration-300",
          "max-sm:fixed max-sm:inset-y-0 max-sm:left-0 max-sm:shadow-xl",
          isSidebarOpen ? "max-sm:translate-x-0" : "max-sm:-translate-x-full",
        )}
      />

      {isSidebarOpen && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Close navigation"
          className="absolute left-20 top-4 z-50 rounded-full bg-card p-2 shadow-md sm:hidden"
        >
          <ChevronLeft className="size-5 text-muted-foreground" aria-hidden />
        </button>
      )}

      <main className="z-10 min-w-0 flex-1 overflow-auto bg-muted/50 dark:bg-background">{children}</main>
    </div>
  )
}
