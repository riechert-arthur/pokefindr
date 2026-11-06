"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

const OPTIONS: { value: "light" | "dark" | "system"; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

interface ThemeToggleProps {
  /**
   * "segmented" shows light, dark and system (settings). "toggle" is one icon
   * button that switches between light and dark from whatever is showing
   * (sidebar), so every click changes the theme.
   */
  variant?: "segmented" | "toggle"
  className?: string
}

/** Light / dark (/ system) theme switch. Renders a neutral placeholder until mounted, so SSR and client markup match. */
export function ThemeToggle({ variant = "segmented", className }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const current = mounted ? (theme ?? "system") : "system"

  if (variant === "toggle") {
    const isDark = mounted && resolvedTheme === "dark"
    const Icon = isDark ? Moon : Sun
    const next = isDark ? "light" : "dark"
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={`Switch to ${next} theme`}
        title={`Switch to ${next} theme`}
        className={cn("rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground", className)}
      >
        <Icon className="size-6" aria-hidden />
      </button>
    )
  }

  return (
    <div role="group" aria-label="Theme" className={cn("inline-flex rounded-lg border border-border bg-card p-0.5", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={current === value}
          onClick={() => setTheme(value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            // Exclusive branches: cn() doesn't merge conflicting classes, so both text colors can't be present.
            current === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}
