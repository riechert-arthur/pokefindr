"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

/** Each option's label is its value's message in `ui.theme`. */
const OPTIONS: { value: "light" | "dark" | "system"; icon: LucideIcon }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
]

interface ThemeToggleProps {
  /**
   * "segmented" shows light, dark and system (settings). "toggle" is one
   * button that switches between light and dark from whatever is showing
   * (the app rail), so every click changes the theme.
   */
  variant?: "segmented" | "toggle"
  className?: string
  /** The toggle's label ("Dark theme"), e.g. screen-reader only while the app rail is collapsed. */
  labelClassName?: string
}

/** Light / dark (/ system) theme switch. Renders a neutral placeholder until mounted, so SSR and client markup match. */
export function ThemeToggle({ variant = "segmented", className, labelClassName }: ThemeToggleProps) {
  const t = useTranslations("ui.theme")
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const current = mounted ? (theme ?? "system") : "system"

  if (variant === "toggle") {
    const isDark = mounted && resolvedTheme === "dark"
    // The icon and label show the theme a click switches to; the name says so in full.
    const Icon = isDark ? Sun : Moon
    const next = isDark ? "light" : "dark"
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={t(isDark ? "switchToLight" : "switchToDark")}
        className={cn("flex items-center gap-3 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground", className)}
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        <span className={labelClassName}>{t(isDark ? "lightTheme" : "darkTheme")}</span>
      </button>
    )
  }

  return (
    <div role="group" aria-label={t("group")} className={cn("inline-flex rounded-lg border border-border bg-card p-0.5", className)}>
      {OPTIONS.map(({ value, icon: Icon }) => (
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
          {t(value)}
        </button>
      ))}
    </div>
  )
}
