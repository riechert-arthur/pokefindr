"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType, Ref, SVGProps } from "react"
import { BookOpenIcon, HouseIcon, MapPinIcon, SettingsIcon } from "lucide-react"
import { Logo } from "@/components/brand/Logo"
import { DiscordIcon } from "@/components/icons/DiscordIcon"
import { ThemeToggle } from "@/components/pokefindr/ThemeToggle"
import { cn } from "@/lib/utils"

interface RailItem {
  href: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  external?: boolean
}

/** The prototype's rail: Home, Blog, Map. */
const MAIN: RailItem[] = [
  { href: "/home", label: "Home", icon: HouseIcon },
  { href: "/blog", label: "Blog", icon: BookOpenIcon },
  { href: "/map", label: "Map", icon: MapPinIcon },
]

const DISCORD: RailItem = { href: "https://discord.gg/f2uUR5bAZU", label: "Discord", icon: DiscordIcon, external: true }
const SETTINGS: RailItem = { href: "/settings", label: "Settings", icon: SettingsIcon }

/** A 40px rounded icon button, as in the prototype's `.rail button`. */
const itemClass =
  "grid size-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function RailLink({ item, current }: { item: RailItem; current: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      title={item.label}
      aria-current={current ? "page" : undefined}
      className={cn(itemClass, current && "bg-muted text-foreground")}
      {...(item.external && { target: "_blank", rel: "noopener noreferrer" })}
    >
      <Icon className="size-5" aria-hidden />
    </Link>
  )
}

/** The rail's element id, for the phone menu buttons' aria-controls. */
export const APP_NAV_ID = "app-navigation"

interface AppRailProps {
  /** Shows Settings. */
  signedIn?: boolean
  ref?: Ref<HTMLElement>
  className?: string
}

/**
 * The app's side navigation on the map and in-app pages, from the redesign
 * prototype: a 64px card-colored rail with the logo, then Home, Blog and Map,
 * the current page shaded. Discord, Settings and the theme toggle sit at the
 * bottom; the prototype leaves them out, but the app needs them somewhere.
 */
export function AppRail({ signedIn = false, className, ref }: AppRailProps) {
  const pathname = usePathname()
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav
      id={APP_NAV_ID}
      aria-label="App navigation"
      className={cn("flex w-16 flex-none flex-col items-center gap-2 border-r border-border bg-card py-3.5", className)}
      ref={ref}
    >
      <Link href="/" aria-label="PokeFindr home" className="mb-2 grid size-10 place-items-center">
        <Logo size={30} />
      </Link>
      {MAIN.map((item) => (
        <RailLink key={item.href} item={item} current={isCurrent(item.href)} />
      ))}
      <div className="mt-auto flex flex-col items-center gap-2">
        <RailLink item={DISCORD} current={false} />
        {signedIn && <RailLink item={SETTINGS} current={isCurrent(SETTINGS.href)} />}
        <ThemeToggle variant="toggle" className={cn(itemClass, "p-0 [&_svg]:size-5")} />
      </div>
    </nav>
  )
}
