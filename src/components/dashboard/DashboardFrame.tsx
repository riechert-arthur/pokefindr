"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { OpenNavButton } from "@/components/pokefindr/OpenNavButton"
import { UserMenu } from "@/components/pokefindr/UserMenu"
import { useSessionContext } from "@/components/providers/SessionProvider"
import { useSidebar } from "@/components/providers/SidebarContextProvider"

/**
 * The frame of the assistant's dashboard pages, /home and /chat: the
 * prototype's soft glow in the logo's colors, and a header with the phone
 * menu button, Open map and the account menu. The page fills the rest.
 */
export function DashboardFrame({ children }: { children: ReactNode }) {
  const t = useTranslations("dashboard")
  const { session } = useSessionContext()
  const { isSidebarOpen } = useSidebar()
  return (
    <div className={isSidebarOpen ? "h-full max-sm:ml-16" : "h-full"}>
      <div className="relative isolate flex h-full min-w-0 flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[-10%] top-[-30%] -z-10 h-[70%] opacity-35 blur-[70px] [background:radial-gradient(35%_45%_at_30%_40%,hsl(var(--brand)/0.5),transparent_70%),radial-gradient(35%_45%_at_70%_35%,hsl(var(--brand-2)/0.45),transparent_70%)]"
        />
        <header className="flex items-center gap-1.5 px-4 py-3 sm:px-5">
          <OpenNavButton className="mr-1" />
          <span className="flex-1" />
          <Button asChild variant="ghost" size="sm">
            <Link href="/map">{t("openMap")}</Link>
          </Button>
          <UserMenu userName={session?.username ?? t("guest")} imageUrl={session?.image} />
        </header>
        {children}
      </div>
    </div>
  )
}
