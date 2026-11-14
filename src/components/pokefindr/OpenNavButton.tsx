"use client"

import { MenuIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/providers/SidebarContextProvider"
import { cn } from "@/lib/utils"
import { APP_NAV_ID } from "./AppRail"

/** Phones only: the menu button in a page's header that slides the app's navigation in. */
export function OpenNavButton({ className }: { className?: string }) {
  const t = useTranslations("nav")
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  return (
    <Button type="button" variant="ghost" size="icon" onClick={toggleSidebar} className={cn("sm:hidden", className)} aria-label={t("openNavigation")} aria-controls={APP_NAV_ID} aria-expanded={isSidebarOpen}>
      <MenuIcon aria-hidden className="text-muted-foreground" />
    </Button>
  )
}
