import { useId } from "react"
import { cn } from "@/lib/utils"

/**
 * One of the comet's two sweeps on a 24 × 24 grid (#386): it turns around the
 * core, tapering from a rounded head to a point. The other is this one turned
 * 180° about the center. Sampled from the design reference; the outline is the spec.
 */
const SWEEP = "M21.50 12.00 L21.49 11.56 L21.46 11.12 L21.41 10.68 L21.34 10.24 L21.24 9.81 L21.13 9.38 L21.00 8.96 L20.85 8.54 L20.68 8.14 L20.49 7.74 L20.28 7.35 L20.06 6.97 L19.81 6.60 L19.55 6.24 L19.28 5.89 L18.99 5.56 L18.68 5.24 L18.36 4.94 L18.02 4.65 L17.67 4.38 L17.31 4.12 L16.94 3.89 L16.56 3.66 L16.16 3.46 L15.76 3.28 L15.35 3.11 L14.94 2.96 L14.51 2.84 L14.08 2.73 L13.65 2.64 L13.21 2.58 L12.77 2.53 L12.33 2.51 L11.89 2.50 L11.45 2.52 L11.01 2.55 L10.57 2.61 L10.13 2.69 L9.70 2.78 L9.28 2.90 L8.85 3.04 L8.44 3.19 L8.04 3.37 L7.64 3.56 L7.25 3.77 L6.87 4.00 L6.51 4.25 L6.15 4.51 L5.81 4.79 L5.48 5.09 L5.17 5.40 L4.87 5.73 L4.58 6.06 L4.31 6.42 L4.06 6.78 L3.83 7.15 L3.61 7.54 L3.41 7.94 L3.23 8.34 L3.07 8.75 L3.07 8.75 L3.32 8.38 L3.58 8.02 L3.86 7.67 L4.15 7.35 L4.45 7.04 L4.77 6.74 L5.09 6.47 L5.42 6.22 L5.77 5.98 L6.12 5.76 L6.47 5.57 L6.83 5.39 L7.20 5.23 L7.57 5.09 L7.94 4.97 L8.31 4.87 L8.69 4.78 L9.06 4.72 L9.43 4.68 L9.80 4.65 L10.16 4.64 L10.53 4.65 L10.88 4.67 L11.23 4.72 L11.58 4.78 L11.92 4.85 L12.25 4.94 L12.57 5.04 L12.88 5.16 L13.18 5.30 L13.47 5.44 L13.76 5.60 L14.03 5.76 L14.28 5.94 L14.53 6.13 L14.77 6.33 L14.99 6.54 L15.20 6.75 L15.39 6.97 L15.57 7.20 L15.74 7.43 L15.90 7.67 L16.04 7.91 L16.17 8.16 L16.29 8.40 L16.39 8.65 L16.48 8.90 L16.55 9.15 L16.62 9.41 L16.67 9.66 L16.71 9.90 L16.73 10.15 L16.75 10.40 L16.76 10.64 L16.75 10.87 L16.73 11.11 L16.71 11.34 L16.68 11.56 L16.64 11.78 L16.60 12.00 A2.45 2.45 0 0 0 21.50 12.00z"

/** The mark fills its box: 26, 34 and 44 px. */
const SIZES = {
  sm: "size-[26px]",
  md: "size-[34px]",
  lg: "size-11",
} as const

/**
 * The assistant's mark (#386): a comet, two sweeps turning around a core, in
 * the logo's gradient (brand → brand-2, top-left to bottom-right, as Logo.tsx
 * draws its pin), so it follows the logo into every theme. No tile behind it.
 * `thinking` turns the sweeps, one turn every 2.2 s, while the assistant is
 * working; with reduced motion, it dims instead. Hidden from screen readers, so it
 * doesn't tell them who is speaking: whatever does that has to be text.
 */
export function AgentMark({ size = "md", thinking = false, className }: { size?: keyof typeof SIZES; thinking?: boolean; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  return (
    // With reduced motion, thinking dims the mark instead of turning it.
    <svg aria-hidden viewBox="0 0 24 24" className={cn("flex-none", SIZES[size], thinking && "motion-reduce:opacity-50", className)}>
      <defs>
        <linearGradient id={`agent-grad-${id}`} gradientUnits="userSpaceOnUse" x1="2.5" y1="2.5" x2="21.5" y2="21.5">
          <stop offset="0" style={{ stopColor: "hsl(var(--brand))" }} />
          <stop offset="1" style={{ stopColor: "hsl(var(--brand-2))" }} />
        </linearGradient>
        {/* The shapes, as a mask over a still gradient: the sweeps turn, their colors don't. An alpha mask, so the shapes need no fill. */}
        <mask id={`agent-shape-${id}`} className="[mask-type:alpha]">
          <g data-sweeps className={cn("origin-center [transform-box:view-box]", thinking && "animate-[spin_2.2s_linear_infinite] motion-reduce:animate-none")}>
            <path d={SWEEP} />
            <path d={SWEEP} transform="rotate(180 12 12)" />
          </g>
          <circle cx="12" cy="12" r="2.4" />
        </mask>
      </defs>
      <rect width="24" height="24" fill={`url(#agent-grad-${id})`} mask={`url(#agent-shape-${id})`} />
    </svg>
  )
}
