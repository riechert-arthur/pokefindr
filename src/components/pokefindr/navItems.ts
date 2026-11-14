import type { ComponentType, SVGProps } from "react"
import { HouseIcon, InboxIcon, MapPinIcon, MessagesSquareIcon, ShieldIcon } from "lucide-react"
import type { Messages } from "@/i18n/messages"

type NavMessages = Messages["nav"]
/** A plain label in the catalog's `nav` messages, not a group like `userMenu`. */
type NavLabel = { [K in keyof NavMessages]: NavMessages[K] extends string ? K : never }[keyof NavMessages]

/** A link in the app's navigation. */
export interface NavItem {
  href: string
  label: NavLabel
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Leaves the site, so it opens in a new tab. */
  external?: boolean
}

/** The pages both the rail (AppRail) and the phone's tab bar (TabBar) link to. Each adds its own extras. */
export const NAV = {
  home: { href: "/home", label: "home", icon: HouseIcon },
  // The assistant's conversation (#391).
  chat: { href: "/chat", label: "chat", icon: MessagesSquareIcon },
  map: { href: "/map", label: "map", icon: MapPinIcon },
  /** For whoever has `moderation.view` (#293). */
  moderate: { href: "/moderate", label: "moderate", icon: InboxIcon },
  /** For whoever has `admin.open`: admins, not moderators. */
  admin: { href: "/admin", label: "admin", icon: ShieldIcon },
} as const satisfies Record<string, NavItem>

/** Whether a link to `href` is for the page at `pathname`: that page or one under it. */
export const isCurrentPath = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`)
