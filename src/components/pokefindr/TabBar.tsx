"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { useEffect, type ComponentType, type SVGProps } from "react"
import { CirclePlusIcon, HouseIcon, MapPinIcon, ShieldIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface Tab {
  href: string
  /** Its label in the catalog's `nav` messages. */
  label: "home" | "map" | "addPlace" | "admin"
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const HOME: Tab = { href: "/home", label: "home", icon: HouseIcon }
const MAP: Tab = { href: "/map", label: "map", icon: MapPinIcon }
const ADD: Tab = { href: "/map?add=1", label: "addPlace", icon: CirclePlusIcon }
const ADMIN: Tab = { href: "/admin", label: "admin", icon: ShieldIcon }

interface TabBarProps {
  /** Shows "Add a place", once the add flow exists (R4). */
  canAdd?: boolean
  /** Shows "Admin", for admins (R8). */
  isAdmin?: boolean
  className?: string
}

/**
 * The phone's tab bar from the prototype (#160): Home, Map, Add a place and
 * Admin, in the layout below the page (not over it), above the bottom safe
 * area. Shown where the icon rail isn't (below `sm`). While it's there,
 * toasts sit above it (--toast-bottom, read by the Toaster).
 */
export function TabBar({ canAdd = false, isAdmin = false, className }: TabBarProps) {
  const t = useTranslations("nav")
  const pathname = usePathname()
  const tabs = [HOME, MAP, ...(canAdd ? [ADD] : []), ...(isAdmin ? [ADMIN] : [])]

  useEffect(() => {
    document.documentElement.classList.add("has-tabbar")
    return () => document.documentElement.classList.remove("has-tabbar")
  }, [])

  return (
    <nav
      aria-label={t("tabs")}
      className={cn(
        "z-20 grid flex-none border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))]",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => {
        const current = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className="group flex h-14 min-w-0 flex-col items-center justify-center gap-[3px] text-overline font-medium normal-case tracking-normal text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
          >
            <Icon className="size-[22px] group-aria-[current=page]:text-primary" aria-hidden />
            <span className="max-w-full truncate">{t(tab.label)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
