"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { useEffect, useRef, useState, type ComponentType, type Ref, type SVGProps } from "react"
import { BookOpenIcon, HouseIcon, InboxIcon, MapPinIcon, SettingsIcon, ShieldIcon } from "lucide-react"
import { Logo } from "@/components/brand/Logo"
import { DiscordIcon } from "@/components/icons/DiscordIcon"
import { LanguageSwitcher } from "@/components/pokefindr/LanguageSwitcher"
import { ThemeToggle } from "@/components/pokefindr/ThemeToggle"
import { minWidth } from "@/lib/design/breakpoints"
import { SUPPORT_URL } from "@/lib/links"
import { cn } from "@/lib/utils"

type NavLabel = "home" | "blog" | "map" | "discord" | "settings" | "moderate" | "admin"

interface RailItem {
  href: string
  /** Its label in the catalog's `nav` messages. */
  label: NavLabel
  icon: ComponentType<SVGProps<SVGSVGElement>>
  external?: boolean
}

/** The prototype's rail: Home, Blog, Map. */
const MAIN: RailItem[] = [
  { href: "/home", label: "home", icon: HouseIcon },
  { href: "/blog", label: "blog", icon: BookOpenIcon },
  { href: "/map", label: "map", icon: MapPinIcon },
]

const DISCORD: RailItem = { href: SUPPORT_URL, label: "discord", icon: DiscordIcon, external: true }
const SETTINGS: RailItem = { href: "/settings", label: "settings", icon: SettingsIcon }
const MODERATE: RailItem = { href: "/moderate", label: "moderate", icon: InboxIcon }
const ADMIN: RailItem = { href: "/admin", label: "admin", icon: ShieldIcon }

/** Desktop rail widths: 64px collapsed (its place in the layout), 208px expanded. */
const EXPANDED_WIDTH = "w-52"
/** Delays that keep the rail from flickering as the pointer crosses it on the way to the map. */
const OPEN_DELAY = 150
const CLOSE_DELAY = 250

/** A 40px-tall row: the icon where the collapsed rail's button was, then the label. */
const linkClass =
  "flex h-10 w-full items-center gap-3 rounded-md px-2.5 text-body font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"

/** A row's label: always read out, shown when expanded and in the phone drawer. */
const labelClass = (expanded: boolean) => cn("truncate whitespace-nowrap", !expanded && "sm:sr-only")

const matches = (query: string) => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches

/** From `sm` up the rail expands; below, it's the phone drawer, which always shows its labels. */
const isDrawer = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && !matches(minWidth("sm"))

/** Keyboard focus, not focus from a click or tap (which shouldn't leave the rail open). */
function focusVisible(el: EventTarget | null) {
  if (!(el instanceof Element)) return false
  try {
    return el.matches(":focus-visible")
  } catch {
    return true
  }
}

function RailLink({ item, current, expanded }: { item: RailItem; current: boolean; expanded: boolean }) {
  const t = useTranslations("nav")
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={cn(linkClass, current && "bg-muted text-foreground")}
      {...(item.external && { target: "_blank", rel: "noopener noreferrer" })}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className={labelClass(expanded)}>{t(item.label)}</span>
    </Link>
  )
}

/** The rail's element id, for the phone menu buttons' aria-controls. */
export const APP_NAV_ID = "app-navigation"

interface AppRailProps {
  /** Shows Settings. */
  signedIn?: boolean
  /** Shows Moderate (/moderate), for whoever has `moderation.view`. */
  canModerate?: boolean
  /** Shows Admin (/admin), for whoever has `admin.open`. */
  isAdmin?: boolean
  /** Holds the rail expanded or collapsed instead of following hover and focus (stories). */
  expanded?: boolean
  ref?: Ref<HTMLElement>
  className?: string
}

/**
 * The app's side navigation on the map and in-app pages, from the redesign
 * prototype: a 64px card-colored rail with the logo, then Home, Blog and Map,
 * the current page shaded. Discord, Settings and the theme toggle sit at the
 * bottom; the prototype leaves them out, but the app needs them somewhere.
 *
 * Hovering over it (with a mouse) or tabbing into it widens it to 208px with a
 * label beside each icon (#291). The wide panel overlays the page, so the 64px
 * column, and the map beside it, don't move. Escape or moving focus out
 * collapses it. In the phone drawer (below `sm`) the labels always show.
 */
export function AppRail({ signedIn = false, canModerate = false, isAdmin = false, expanded: held, className, ref }: AppRailProps) {
  const t = useTranslations("nav")
  const pathname = usePathname()
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  // The language list opens in a portal, outside the rail: keep the rail open while it is.
  const [menuOpen, setMenuOpen] = useState(false)
  // Escape collapses it until focus or the pointer leaves.
  const [dismissed, setDismissed] = useState(false)
  const [open, setOpen] = useState(false)
  // Following a link from the rail collapses it: focus stays on the link (the
  // rail is in the layout), and the new page shouldn't open under the panel.
  const [shownPath, setShownPath] = useState(pathname)
  if (pathname !== shownPath) {
    setShownPath(pathname)
    setDismissed(true)
  }
  const want = (hovered || focused || menuOpen) && !dismissed
  useEffect(() => {
    if (want === open) return
    const delay = want ? (focused || menuOpen ? 0 : OPEN_DELAY) : dismissed ? 0 : CLOSE_DELAY
    const timer = setTimeout(() => setOpen(want), delay)
    return () => clearTimeout(timer)
  }, [want, open, focused, menuOpen, dismissed])
  const expanded = held ?? open

  // React sends no pointerleave when the language list (in a portal, so inside
  // the rail as far as React knows) unmounts under the pointer. Follow where the
  // pointer actually is instead. Only a mouse hovers: on touch, a tap goes
  // straight to the link.
  const navRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const onOver = (e: PointerEvent) => {
      const inside = navRef.current?.contains(e.target as Node) ?? false
      if (!inside || e.pointerType === "mouse") setHovered(inside)
    }
    document.addEventListener("pointerover", onOver)
    return () => document.removeEventListener("pointerover", onOver)
  }, [])
  const setRef = (el: HTMLElement | null) => {
    navRef.current = el
    if (typeof ref === "function") ref(el)
    else if (ref) ref.current = el
  }

  return (
    <nav
      id={APP_NAV_ID}
      aria-label={t("appNavigation")}
      data-expanded={expanded || undefined}
      className={cn("relative w-16 flex-none max-sm:w-52", className)}
      ref={setRef}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return
        setDismissed(false)
        setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
        if (!focused) setDismissed(false)
      }}
      onFocus={(e) => {
        const keyboard = focusVisible(e.target)
        setFocused(keyboard)
        // Tabbing on after Escape brings the labels back.
        if (keyboard) setDismissed(false)
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setFocused(false)
        setDismissed(false)
      }}
      onKeyDown={(e) => {
        // In the phone drawer, Escape is SidebarLayout's: it closes the drawer.
        // `want` too: Escape during the open delay cancels it.
        if (e.key !== "Escape" || !(expanded || want) || menuOpen || isDrawer()) return
        e.stopPropagation()
        setDismissed(true)
      }}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 flex w-16 flex-col gap-2 overflow-hidden border-r border-border bg-card px-3 py-3.5",
          "transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none max-sm:w-full",
          expanded && cn(EXPANDED_WIDTH, "shadow-xl"),
        )}
      >
        <Link href="/" aria-label={t("logoHome")} className="mb-2 flex h-10 shrink-0 items-center rounded-md px-[5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo size={30} title="" className={expanded ? "hidden" : "max-sm:hidden"} />
          <Logo variant="full" size={30} title="" className={cn("whitespace-nowrap", !expanded && "sm:hidden")} />
        </Link>
        {MAIN.map((item) => (
          <RailLink key={item.href} item={item} current={isCurrent(item.href)} expanded={expanded} />
        ))}
        {canModerate && <RailLink item={MODERATE} current={isCurrent(MODERATE.href)} expanded={expanded} />}
        {isAdmin && <RailLink item={ADMIN} current={isCurrent(ADMIN.href)} expanded={expanded} />}
        <div className="mt-auto flex flex-col items-start gap-2">
          <RailLink item={DISCORD} current={false} expanded={expanded} />
          {signedIn && <RailLink item={SETTINGS} current={isCurrent(SETTINGS.href)} expanded={expanded} />}
          {/*
            The language badge (#356). Collapsed: the globe and code, no arrow. Expanded (and in the
            phone drawer): as wide as the rail, with the language's name and the arrow at the end.
            Same left edge and padding either way, so the globe doesn't move as the rail opens.
          */}
          <LanguageSwitcher
            variant="compact"
            className={cn("px-1.5 max-sm:w-full [&>span]:mr-auto", expanded ? "w-full" : "sm:[&>svg:last-child]:hidden")}
            codeClassName={expanded ? "hidden" : "max-sm:hidden"}
            nameClassName={cn("truncate", !expanded && "sm:hidden")}
            onOpenChange={setMenuOpen}
          />
          <ThemeToggle variant="toggle" className={linkClass} labelClassName={labelClass(expanded)} />
        </div>
      </div>
    </nav>
  )
}
