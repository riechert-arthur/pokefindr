"use client"

import { UserIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export type UserAvatarSize = "xs" | "sm" | "md" | "lg"

/** Diameter, the initial's type token and the person icon's size, per avatar size. */
const SIZES: Record<UserAvatarSize, { box: string; text: string; icon: string }> = {
  // Review rows.
  xs: { box: "size-[22px]", text: "text-overline tracking-normal", icon: "size-3" },
  // Admin sidebar.
  sm: { box: "size-7", text: "text-caption font-semibold", icon: "size-3.5" },
  // Header menus.
  md: { box: "size-9", text: "text-subheading", icon: "size-4" },
  // Settings.
  lg: { box: "size-16", text: "text-title", icon: "size-8" },
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/**
 * The first character of a name, uppercased, if it's a letter in any script;
 * otherwise null, so the avatar shows a person icon instead of "_" or half an emoji.
 */
export function avatarInitial(name: string | null | undefined): string | null {
  // NFC and a grapheme split keep an accent written as a separate mark ("E\u0301lodie")
  // with its letter, and don't cut an emoji in half.
  const first = graphemes.segment((name ?? "").trim().normalize("NFC"))[Symbol.iterator]().next().value?.segment
  if (!first || !/^\p{L}\p{M}*$/u.test(first)) return null
  // Keep letters whose capital is two letters ("ß" is "SS", "ﬁ" is "FI") as they are.
  const upper = first.toUpperCase()
  return Array.from(upper).length > Array.from(first).length ? first : upper
}

interface UserAvatarProps {
  /** The person's username or display name; the placeholder is its first letter. */
  name: string | null | undefined
  /** Their picture. While it loads, or if it fails, the placeholder shows instead. */
  imageUrl?: string | null
  size?: UserAvatarSize
  className?: string
}

/**
 * The only way to show a person: their picture, or the first letter of their name
 * on the brand color. Decorative, because the name is always shown next to it.
 */
export function UserAvatar({ name, imageUrl, size = "md", className }: UserAvatarProps) {
  const s = SIZES[size]
  const initial = avatarInitial(name)
  return (
    <Avatar className={cn(s.box, className)} aria-hidden>
      {imageUrl && <AvatarImage src={imageUrl} alt="" className="object-cover" />}
      {/* primary-foreground on brand is checked at 4.5:1 in both themes (__tests__/design/tokens.test.ts). */}
      <AvatarFallback className={cn("bg-brand text-primary-foreground", s.text)}>
        {initial ?? <UserIcon aria-hidden className={s.icon} />}
      </AvatarFallback>
    </Avatar>
  )
}
