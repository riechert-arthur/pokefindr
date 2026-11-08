"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, type ComponentType, type SVGProps } from "react"
import { CirclePlusIcon, HouseIcon, MapPinIcon, ShieldIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface Tab {
  href: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const HOME: Tab = { href: "/home", label: "Home", icon: HouseIcon }
const MAP: Tab = { href: "/map", label: "Map", icon: MapPinIcon }
const ADD: Tab = { href: "/map?add=1", label: "Add a place", icon: CirclePlusIcon }
const ADMIN: Tab = { href: "/admin", label: "Admin", icon: ShieldIcon }

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
  const pathname = usePathname()
  const tabs = [HOME, MAP, ...(canAdd ? [ADD] : []), ...(isAdmin ? [ADMIN] : [])]

  useEffect(() => {
    document.documentElement.classList.add("has-tabbar")
    return () => document.documentElement.classList.remove("has-tabbar")
  }, [])

  return (
    <nav
      aria-label="Tabs"
      className={cn(
        "z-20 grid flex-none border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))]",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const current = pathname === t.href || pathname.startsWith(`${t.href}/`)
        const Icon = t.icon
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={current ? "page" : undefined}
            className="group flex h-14 min-w-0 flex-col items-center justify-center gap-[3px] text-overline font-medium normal-case tracking-normal text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
          >
            <Icon className="size-[22px] group-aria-[current=page]:text-primary" aria-hidden />
            <span className="max-w-full truncate">{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
