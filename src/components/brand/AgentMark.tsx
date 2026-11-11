import { useId } from "react"
import { cn } from "@/lib/utils"

/**
 * The comet's two sweeps on a 24 × 24 grid (#386): each turns around the core,
 * tapering from a rounded head to a point, with 2-fold symmetry. Sampled from
 * the design reference; the outline is the spec.
 */
const SWEEPS = [
  "M21.50 12.00 L21.49 11.56 L21.46 11.12 L21.41 10.68 L21.34 10.24 L21.24 9.81 L21.13 9.38 L21.00 8.96 L20.85 8.54 L20.68 8.14 L20.49 7.74 L20.28 7.35 L20.06 6.97 L19.81 6.60 L19.55 6.24 L19.28 5.89 L18.99 5.56 L18.68 5.24 L18.36 4.94 L18.02 4.65 L17.67 4.38 L17.31 4.12 L16.94 3.89 L16.56 3.66 L16.16 3.46 L15.76 3.28 L15.35 3.11 L14.94 2.96 L14.51 2.84 L14.08 2.73 L13.65 2.64 L13.21 2.58 L12.77 2.53 L12.33 2.51 L11.89 2.50 L11.45 2.52 L11.01 2.55 L10.57 2.61 L10.13 2.69 L9.70 2.78 L9.28 2.90 L8.85 3.04 L8.44 3.19 L8.04 3.37 L7.64 3.56 L7.25 3.77 L6.87 4.00 L6.51 4.25 L6.15 4.51 L5.81 4.79 L5.48 5.09 L5.17 5.40 L4.87 5.73 L4.58 6.06 L4.31 6.42 L4.06 6.78 L3.83 7.15 L3.61 7.54 L3.41 7.94 L3.23 8.34 L3.07 8.75 L3.07 8.75 L3.32 8.38 L3.58 8.02 L3.86 7.67 L4.15 7.35 L4.45 7.04 L4.77 6.74 L5.09 6.47 L5.42 6.22 L5.77 5.98 L6.12 5.76 L6.47 5.57 L6.83 5.39 L7.20 5.23 L7.57 5.09 L7.94 4.97 L8.31 4.87 L8.69 4.78 L9.06 4.72 L9.43 4.68 L9.80 4.65 L10.16 4.64 L10.53 4.65 L10.88 4.67 L11.23 4.72 L11.58 4.78 L11.92 4.85 L12.25 4.94 L12.57 5.04 L12.88 5.16 L13.18 5.30 L13.47 5.44 L13.76 5.60 L14.03 5.76 L14.28 5.94 L14.53 6.13 L14.77 6.33 L14.99 6.54 L15.20 6.75 L15.39 6.97 L15.57 7.20 L15.74 7.43 L15.90 7.67 L16.04 7.91 L16.17 8.16 L16.29 8.40 L16.39 8.65 L16.48 8.90 L16.55 9.15 L16.62 9.41 L16.67 9.66 L16.71 9.90 L16.73 10.15 L16.75 10.40 L16.76 10.64 L16.75 10.87 L16.73 11.11 L16.71 11.34 L16.68 11.56 L16.64 11.78 L16.60 12.00 A2.45 2.45 0 0 0 21.50 12.00z",
  "M2.50 12.00 L2.51 12.44 L2.54 12.88 L2.59 13.32 L2.66 13.76 L2.76 14.19 L2.87 14.62 L3.00 15.04 L3.15 15.46 L3.32 15.86 L3.51 16.26 L3.72 16.65 L3.94 17.03 L4.19 17.40 L4.45 17.76 L4.72 18.11 L5.01 18.44 L5.32 18.76 L5.64 19.06 L5.98 19.35 L6.33 19.62 L6.69 19.88 L7.06 20.11 L7.44 20.34 L7.84 20.54 L8.24 20.72 L8.65 20.89 L9.06 21.04 L9.49 21.16 L9.92 21.27 L10.35 21.36 L10.79 21.42 L11.23 21.47 L11.67 21.49 L12.11 21.50 L12.55 21.48 L12.99 21.45 L13.43 21.39 L13.87 21.31 L14.30 21.22 L14.72 21.10 L15.15 20.96 L15.56 20.81 L15.96 20.63 L16.36 20.44 L16.75 20.23 L17.13 20.00 L17.49 19.75 L17.85 19.49 L18.19 19.21 L18.52 18.91 L18.83 18.60 L19.13 18.27 L19.42 17.94 L19.69 17.58 L19.94 17.22 L20.17 16.85 L20.39 16.46 L20.59 16.06 L20.77 15.66 L20.93 15.25 L20.93 15.25 L20.68 15.62 L20.42 15.98 L20.14 16.33 L19.85 16.65 L19.55 16.96 L19.23 17.26 L18.91 17.53 L18.58 17.78 L18.23 18.02 L17.88 18.24 L17.53 18.43 L17.17 18.61 L16.80 18.77 L16.43 18.91 L16.06 19.03 L15.69 19.13 L15.31 19.22 L14.94 19.28 L14.57 19.32 L14.20 19.35 L13.84 19.36 L13.47 19.35 L13.12 19.33 L12.77 19.28 L12.42 19.22 L12.08 19.15 L11.75 19.06 L11.43 18.96 L11.12 18.84 L10.82 18.70 L10.53 18.56 L10.24 18.40 L9.97 18.24 L9.72 18.06 L9.47 17.87 L9.23 17.67 L9.01 17.46 L8.80 17.25 L8.61 17.03 L8.43 16.80 L8.26 16.57 L8.10 16.33 L7.96 16.09 L7.83 15.84 L7.71 15.60 L7.61 15.35 L7.52 15.10 L7.45 14.85 L7.38 14.59 L7.33 14.34 L7.29 14.10 L7.27 13.85 L7.25 13.60 L7.24 13.36 L7.25 13.13 L7.27 12.89 L7.29 12.66 L7.32 12.44 L7.36 12.22 L7.40 12.00 A2.45 2.45 0 0 0 2.50 12.00z",
] as const

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
 * working; never with reduced motion. Hidden from screen readers, so it
 * doesn't tell them who is speaking: whatever does that has to be text.
 */
export function AgentMark({ size = "md", thinking = false, className }: { size?: keyof typeof SIZES; thinking?: boolean; className?: string }) {
  const gradientId = `agent-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const fill = `url(#${gradientId})`
  return (
    <svg aria-hidden viewBox="0 0 24 24" data-thinking={thinking || undefined} className={cn("flex-none", SIZES[size], className)}>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="2.5" y1="2.5" x2="21.5" y2="21.5">
          <stop offset="0" style={{ stopColor: "hsl(var(--brand))" }} />
          <stop offset="1" style={{ stopColor: "hsl(var(--brand-2))" }} />
        </linearGradient>
      </defs>
      {/* The sweeps turn around the grid's center while thinking; the core stays still. */}
      <g data-sweeps className={cn("origin-center [transform-box:view-box]", thinking && "animate-[spin_2.2s_linear_infinite] motion-reduce:animate-none")}>
        {SWEEPS.map((d) => (
          <path key={d.slice(0, 12)} fill={fill} d={d} />
        ))}
      </g>
      <circle cx="12" cy="12" r="2.4" fill={fill} />
    </svg>
  )
}
