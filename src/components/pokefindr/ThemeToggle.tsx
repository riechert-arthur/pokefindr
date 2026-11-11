"use client"

import { useEffect, useId, useState } from "react"
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

/** Each option's label is its value's message in `ui.theme`. */
const OPTIONS: { value: "light" | "dark" | "system"; icon: LucideIcon }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
]

interface ThemeToggleProps {
  /**
   * "segmented" shows light, dark and system (settings). "toggle" is a "Dark
   * theme" switch (the app rail): on while dark is showing, whether chosen or
   * from the system, so every flip changes the theme.
   */
  variant?: "segmented" | "toggle"
  className?: string
  /** The switch's label ("Dark theme"), e.g. screen-reader only while the app rail is collapsed. */
  labelClassName?: string
}

/** Light / dark (/ system) theme switch. Renders a neutral placeholder until mounted, so SSR and client markup match. */
export function ThemeToggle({ variant = "segmented", className, labelClassName }: ThemeToggleProps) {
  const t = useTranslations("ui.theme")
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const current = mounted ? (theme ?? "system") : "system"
  const id = useId()

  if (variant === "toggle") {
    const isDark = mounted && resolvedTheme === "dark"
    const Icon = isDark ? Moon : Sun
    return (
      // The whole label flips the switch, so a caller can frame it (the app rail's badge).
      <label htmlFor={id} className={cn("flex cursor-pointer items-center gap-2", className)}>
        <Switch id={id} checked={isDark} onCheckedChange={(on) => setTheme(on ? "dark" : "light")} thumb={<Icon aria-hidden />} />
        <span className={labelClassName}>{t("darkTheme")}</span>
      </label>
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
