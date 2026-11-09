import { useId } from "react"
import { cn } from "@/lib/utils"

interface LogoProps {
  /** "mark": the pin only. "full": the pin plus the PokeFindr wordmark. */
  variant?: "mark" | "full"
  /** Height of the mark in pixels; the wordmark scales with it. */
  size?: number
  className?: string
  /** Accessible name. Pass "" when the logo sits next to visible "PokeFindr" text. */
  title?: string
}

/**
 * The PokeFindr mark: a map pin (brand → brand-2 gradient) holding a trading
 * card, with a spark. Colors come from the design tokens, so it follows the
 * theme. Static copies live in public/brand/ for places tokens can't reach.
 */
export function Logo({ variant = "mark", size = 32, className, title = "PokeFindr" }: LogoProps) {
  const gradientId = `logo-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const mark = (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-label={variant === "mark" && title ? title : undefined}
      aria-hidden={variant === "full" || !title ? true : undefined}
      className="shrink-0"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "hsl(var(--brand))" }} />
          <stop offset="1" style={{ stopColor: "hsl(var(--brand-2))" }} />
        </linearGradient>
      </defs>
      <path
        d="M16 1.5c-6.4 0-11.5 5-11.5 11.3 0 7.9 9.5 16.6 10.5 17.4a1.4 1.4 0 0 0 2 0c1-.8 10.5-9.5 10.5-17.4C27.5 6.5 22.4 1.5 16 1.5z"
        fill={`url(#${gradientId})`}
      />
      <g transform="rotate(-10 16 12.5)">
        <rect x="11" y="6" width="10" height="13.5" rx="1.8" style={{ fill: "hsl(var(--logo-card))" }} />
        <rect x="12.6" y="7.6" width="6.8" height="5.4" rx=".8" fill={`url(#${gradientId})`} opacity=".35" />
        <rect x="12.6" y="14.4" width="6.8" height="1.2" rx=".6" fill={`url(#${gradientId})`} opacity=".45" />
        <rect x="12.6" y="16.6" width="4.4" height="1.2" rx=".6" fill={`url(#${gradientId})`} opacity=".3" />
      </g>
      <path
        d="M24.6 2.2l.75 1.75 1.75.75-1.75.75-.75 1.75-.75-1.75-1.75-.75 1.75-.75z"
        style={{ fill: "hsl(var(--spark))" }}
      />
    </svg>
  )

  if (variant === "mark") return <span className={cn("inline-flex", className)}>{mark}</span>

  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)} role={title ? "img" : undefined} aria-label={title || undefined}>
      {mark}
      {/* The wordmark is the brand name in every language. */}
      {/* eslint-disable no-restricted-syntax */}
      <span aria-hidden className="font-sans font-medium" style={{ fontSize: size * 0.6, letterSpacing: "-0.03em" }}>
        Poke
        <b className="bg-gradient-to-br from-brand to-brand-2 bg-clip-text font-extrabold text-transparent">Findr</b>
      </span>
      {/* eslint-enable no-restricted-syntax */}
    </span>
  )
}
