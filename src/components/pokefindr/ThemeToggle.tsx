"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, MoonStar, Sparkles, Sun, type LucideIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { COMPACT_TRIGGER, CompactLabel } from "@/components/pokefindr/CompactSelect"
import type { Theme } from "@/lib/design/themes"
import { cn } from "@/lib/utils"

/** The themes (src/lib/design/themes.ts) and System; each label is a message in `ui.theme`. */
const OPTIONS: { value: Theme | "system"; label: "light" | "dark" | "holoLight" | "holoDark" | "system"; icon: LucideIcon }[] = [
  { value: "light", label: "light", icon: Sun },
  { value: "dark", label: "dark", icon: Moon },
  { value: "holo-light", label: "holoLight", icon: Sparkles },
  { value: "holo-dark", label: "holoDark", icon: MoonStar },
  { value: "system", label: "system", icon: Monitor },
]

interface ThemeToggleProps {
  /**
   * "segmented" shows the options side by side (settings). "compact" is a
   * badge that opens them as a list, like the language picker (the app rail).
   */
  variant?: "segmented" | "compact"
  className?: string
  /** Compact: the chosen theme's name ("Light"), e.g. screen-reader only while the app rail is collapsed. */
  labelClassName?: string
  /** Compact: when the list opens or closes (the app rail stays expanded while it's open). */
  onOpenChange?: (open: boolean) => void
}

/** Light / dark / system theme picker. The stored choice is only known once mounted, so SSR and client markup match until then. */
export function ThemeToggle({ variant = "segmented", className, labelClassName, onOpenChange }: ThemeToggleProps) {
  const t = useTranslations("ui.theme")
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const current = mounted ? (theme ?? "system") : "system"

  if (variant === "compact") {
    // An unknown stored value shows as System, which is what next-themes falls back to.
    const chosen = OPTIONS.find((o) => o.value === current) ?? OPTIONS[OPTIONS.length - 1]
    const Icon = chosen.icon
    return (
      <Select value={chosen.value} onValueChange={setTheme} onOpenChange={onOpenChange}>
        {/* The name says the choice, which the collapsed rail only shows as an icon. */}
        <SelectTrigger aria-label={mounted ? t("current", { theme: t(chosen.label) }) : t("group")} className={cn(COMPACT_TRIGGER, className)}>
          {/* Until the stored theme is known: an empty slot, not a wrong "System" that then flips. */}
          {mounted ? <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <span aria-hidden className="size-3.5 shrink-0" />}
          <CompactLabel>
            <span className={labelClassName}>{mounted ? t(chosen.label) : ""}</span>
          </CompactLabel>
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map(({ value, label, icon: ItemIcon }) => (
            <SelectItem key={value} value={value}>
              <span className="flex items-center gap-2">
                <ItemIcon className="size-4 text-muted-foreground" aria-hidden />
                {t(label)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    // Five options: they wrap onto a second line on a phone.
    <div role="group" aria-label={t("group")} className={cn("inline-flex flex-wrap rounded-lg border border-border bg-card p-0.5", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={current === value}
          onClick={() => setTheme(value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            // Exclusive branches, so the selected and idle text colors never meet.
            current === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {t(label)}
        </button>
      ))}
    </div>
  )
}
