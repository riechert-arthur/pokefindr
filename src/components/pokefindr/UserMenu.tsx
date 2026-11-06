"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import axios from "axios"
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
import { cn } from "@/lib/utils"

interface UserMenuProps {
  /** Avatar diameter in pixels. */
  size: number
  userName: string
  imageUrl?: string
  className?: string
}

/** The signed-in user's avatar, opening a menu with Settings and Log out. */
export function UserMenu({ size, userName, imageUrl, className }: UserMenuProps) {
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await axios.post("/api/auth/logout", undefined, { withCredentials: true })
      // Tell other tabs to drop their session too.
      new BroadcastChannel("auth").postMessage("logout")
      router.refresh()
      router.push("/login")
    } catch (err) {
      console.error("Logout failed", err)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn("rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        aria-label={`Account menu for ${userName}`}
      >
        <Avatar style={{ width: size, height: size }}>
          {imageUrl && <AvatarImage src={imageUrl} alt="" />}
          <AvatarFallback className="bg-brand font-semibold uppercase text-primary-foreground">{userName.charAt(0)}</AvatarFallback>
        </Avatar>
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
        <DropdownMenuItem onSelect={handleLogout}>
          <LogOutIcon aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
