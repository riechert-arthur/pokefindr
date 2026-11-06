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
  /** "segmented" shows all three options (settings); "cycle" is one icon button that steps through them (sidebar). */
  variant?: "segmented" | "cycle"
  className?: string
}

/** Light / dark / system theme switch. Renders a neutral placeholder until mounted, so SSR and client markup match. */
export function ThemeToggle({ variant = "segmented", className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const current = mounted ? (theme ?? "system") : "system"

  if (variant === "cycle") {
    const index = OPTIONS.findIndex((o) => o.value === current)
    const option = OPTIONS[index === -1 ? 2 : index]
    const next = OPTIONS[(OPTIONS.indexOf(option) + 1) % OPTIONS.length]
    const Icon = option.icon
    return (
      <button
        type="button"
        onClick={() => setTheme(next.value)}
        aria-label={`Theme: ${option.label}. Switch to ${next.label}`}
        title={`Theme: ${option.label}`}
        className={cn("rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground", className)}
      >
        <Icon className="size-6" aria-hidden />
      </button>
    )
  }

  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-lg border border-border bg-card p-0.5", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={current === value}
          onClick={() => setTheme(value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body font-medium text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            current === value && "bg-foreground text-background hover:text-background",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}
