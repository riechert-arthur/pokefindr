"use client"

import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { useRef, useState } from "react"
import axios from "axios"
import { toast } from "sonner"
import { LogOutIcon, SettingsIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { broadcastAuth } from "@/lib/auth/broadcast"
import { UserAvatar, type UserAvatarSize } from "@/components/pokefindr/UserAvatar"
import { cn } from "@/lib/utils"

interface UserMenuProps {
  /** The avatar's size (UserAvatar); headers use the default, "md". */
  size?: UserAvatarSize
  userName: string
  imageUrl?: string | null
  /** Classes for the outer element: the trigger button ("dropdown") or the wrapper ("list"). */
  className?: string
  /**
   * "dropdown" (default): the avatar opens a menu. "list": the avatar, name and
   * links laid out inline, for the mobile nav drawer, where Settings and Log
   * out are then one tap away instead of behind a second menu.
   */
  variant?: "dropdown" | "list"
  /** Classes for each Settings / Log out row in the "list" variant, to match the surrounding nav. */
  itemClassName?: string
}

/** The signed-in user's avatar with Settings and Log out. */
export function UserMenu({ size = "md", userName, imageUrl, className, variant = "dropdown", itemClassName }: UserMenuProps) {
  const t = useTranslations("nav.userMenu")
  const router = useRouter()
  // One logout at a time: a second click would fail (no session) and show a false
  // error. The ref blocks a second call in the same tick (before a re-render); the
  // state disables the list button.
  const pending = useRef(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (pending.current) return
    pending.current = true
    setLoggingOut(true)
    try {
      await axios.post("/api/auth/logout", undefined, { withCredentials: true })
      broadcastAuth("logout")
      router.refresh()
      router.push("/login")
    } catch (err) {
      console.error("Logout failed", err)
      toast.error(t("logOutFailed"))
    } finally {
      // Re-enable either way, in case navigation is cancelled and this stays mounted.
      pending.current = false
      setLoggingOut(false)
    }
  }

  if (variant === "list") {
    const item = cn("flex items-center gap-2 rounded-lg px-3 py-2.5 font-semibold text-foreground hover:bg-muted/50", itemClassName)
    return (
      // flex-col stretches each row, including the button, to the same width.
      <div className={cn("flex flex-col gap-1", className)}>
        <div className="flex items-center gap-3 pb-2">
          <UserAvatar size={size} name={userName} imageUrl={imageUrl} />
          <span className="truncate font-semibold text-foreground">{userName}</span>
        </div>
        <Link href="/settings" className={item}>
          <SettingsIcon className="size-5" aria-hidden />
          {t("settings")}
        </Link>
        <button type="button" onClick={handleLogout} disabled={loggingOut} className={cn(item, "text-left disabled:opacity-50")}>
          <LogOutIcon className="size-5" aria-hidden />
          {t("logOut")}
        </button>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn("rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        aria-label={t("trigger", { name: userName })}
      >
        <UserAvatar size={size} name={userName} imageUrl={imageUrl} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="truncate">{userName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon aria-hidden />
            {t("settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleLogout}>
          <LogOutIcon aria-hidden />
          {t("logOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
