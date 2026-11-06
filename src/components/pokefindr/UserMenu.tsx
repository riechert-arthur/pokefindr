"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { toast } from "sonner"
import { LogOutIcon, SettingsIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { broadcastAuth } from "@/lib/auth/broadcast"
import { cn } from "@/lib/utils"

interface UserMenuProps {
  /** Avatar diameter in pixels. */
  size: number
  userName: string
  imageUrl?: string
  /** Classes for the outer element: the trigger button ("dropdown") or the wrapper ("list"). */
  className?: string
  /**
   * "dropdown" (default): the avatar opens a menu. "list": the avatar, name and
   * links laid out inline, for places a popover can't open, such as the mobile
   * nav drawer (a Headless UI dialog that would pull focus back from it).
   */
  variant?: "dropdown" | "list"
}

function UserAvatar({ size, userName, imageUrl }: Pick<UserMenuProps, "size" | "userName" | "imageUrl">) {
  return (
    // primary-foreground on brand is checked at 4.5:1 in both themes (__tests__/design/tokens.test.ts).
    <Avatar style={{ width: size, height: size }}>
      {imageUrl && <AvatarImage src={imageUrl} alt="" />}
      <AvatarFallback className="bg-brand text-lg font-semibold uppercase text-primary-foreground">{userName.charAt(0)}</AvatarFallback>
    </Avatar>
  )
}

/** The signed-in user's avatar with Settings and Log out. */
export function UserMenu({ size, userName, imageUrl, className, variant = "dropdown" }: UserMenuProps) {
  const router = useRouter()
  // One logout at a time: a second click would fail (no session) and show a false error.
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
      toast.error("Couldn't log out. Please try again.")
      pending.current = false
      setLoggingOut(false)
    }
  }

  if (variant === "list") {
    const item = "-mx-3 flex items-center gap-2 rounded-lg px-3 py-2.5 text-base/7 font-semibold text-foreground hover:bg-muted/50"
    return (
      <div className={cn("space-y-1", className)}>
        <div className="flex items-center gap-3 pb-2">
          <UserAvatar size={size} userName={userName} imageUrl={imageUrl} />
          <span className="truncate font-semibold text-foreground">{userName}</span>
        </div>
        <Link href="/settings" className={item}>
          <SettingsIcon className="size-5" aria-hidden />
          Settings
        </Link>
        {/* w-full plus the item's -mx-3 would leave it 1.5rem short, so widen to match the link. */}
        <button type="button" onClick={handleLogout} disabled={loggingOut} className={cn(item, "w-[calc(100%+1.5rem)] text-left disabled:opacity-50")}>
          <LogOutIcon className="size-5" aria-hidden />
          Log out
        </button>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn("rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        aria-label={`Account menu for ${userName}`}
      >
        <UserAvatar size={size} userName={userName} imageUrl={imageUrl} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="truncate">{userName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleLogout} disabled={loggingOut}>
          <LogOutIcon aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
